FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/ostrix
RUN useradd --create-home --uid 10001 ostrix
COPY requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade "pip>=26.2,<27" && python -m pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY wsgi.py ./wsgi.py
USER ostrix
EXPOSE 5000
CMD ["gunicorn", "--workers", "2", "--bind", "0.0.0.0:5000", "--timeout", "60", "wsgi:app"]
