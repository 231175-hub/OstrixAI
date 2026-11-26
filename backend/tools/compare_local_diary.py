"""Compare a journal export to the existing local Docker database. SELECT only."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
from uuid import UUID


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def select(container, query):
    # The existing application credential is expanded only inside the container.
    client = ['docker', 'exec', '-i', container, 'sh', '-c',
              'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" --batch --raw --skip-column-names']
    result = subprocess.run(client, input='START TRANSACTION READ ONLY;\n' + query + ';\nROLLBACK;\n',
                            text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise SystemExit('Local SELECT unavailable. Check the container, schema and application login.')
    return [line.split('\t') for line in result.stdout.splitlines()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--container', default='ostrixai-v03-db-1')
    args = parser.parse_args()
    backup = json.loads(args.backup.read_text(encoding='utf-8-sig'))
    if backup.get('format') != 'ostrixai-diary-v3':
        raise SystemExit('Expected a version 3 diary export.')
    sessions = {str(UUID(s['id'])): s for s in backup['sessions']}
    if not sessions:
        print('Export contains zero sessions.')
        return
    ids = ','.join("'" + sid + "'" for sid in sessions)
    columns = {row[0] for row in select(args.container, 'SHOW COLUMNS FROM academic_sessions')}
    receipt = 's.content_hash IS NOT NULL' if 'content_hash' in columns else '0'
    rows = select(args.container, f"""SELECT s.id, SHA2(s.user_uid,256), SHA2(s.notes_text,256),
                  s.updated_at, {receipt}, SHA2(s.course_name,256), SHA2(s.topic,256),
                  IFNULL(c.collection_type,''), IFNULL(c.order_index,0), IFNULL(SHA2(c.concept_text,256),'')
                  FROM academic_sessions s LEFT JOIN session_concepts c
                  ON c.session_id=s.id AND BINARY c.user_uid=BINARY s.user_uid
                  WHERE s.id IN ({ids}) ORDER BY s.id,s.user_uid,c.collection_type,c.order_index,c.id""")
    # Group by owner as well as ID. Never mix two owners' child records when comparing an export.
    stored = {}
    for *header, kind, index, concept_hash in rows:
        concepts = stored.setdefault(tuple(header), {'DOUBT': [], 'EUREKA': []})
        if kind:
            concepts[kind].append((int(index), concept_hash))
    found = {header[0] for header in stored}
    local_dates = {sid: datetime.fromisoformat(s['updatedAt']).astimezone(timezone.utc).replace(tzinfo=None)
                   for sid, s in sessions.items()}
    latest_date = max(local_dates.values())
    latest_ids = {sid for sid, date in local_dates.items() if date == latest_date}
    for (sid, owner, notes_hash, updated_at, has_hash, course_hash, topic_hash), concepts in stored.items():
        local = sessions[sid]
        local_date = local_dates[sid]
        remote_date = datetime.fromisoformat(updated_at)
        doubts = [(index, digest(text.strip())) for index, text in enumerate(local.get('doubts', []))]
        eureka = [(index, digest(text.strip())) for index, text in enumerate(local.get('eureka', []))]
        print(f'session={digest(sid)[:10]} owner={owner[:10]} updatedAt_UTC={remote_date.isoformat()} '
              f'same_updatedAt={local_date == remote_date} same_notes={digest(local["notes"].strip()) == notes_hash} '
              f'same_course={digest(local["course"].strip()) == course_hash} '
              f'same_topic={digest(local["topic"].strip()) == topic_hash} '
              f'same_doubts={doubts == concepts["DOUBT"]} same_eureka={eureka == concepts["EUREKA"]} '
              f'server_revision_hash={has_hash == "1"}')
    print(f'export_sessions={len(sessions)} matches_by_id={len(found)} unmatched={len(sessions)-len(found)} '
          f'distinct_owners={len({header[1] for header in stored})}')
    print(f'latest_export_updatedAt_UTC={latest_date.isoformat()} latest_sessions={len(latest_ids)} '
          f'latest_present_by_id={len(latest_ids & found)} latest_absent={len(latest_ids - found)}')
    print('The export contains no Firebase identity or client ACK. Owner linkage must be checked in the authenticated app.')


if __name__ == '__main__':
    main()
