"""MySQL connection pool. In production create the pool after each WSGI worker forks."""
from mysql.connector.pooling import MySQLConnectionPool
from app.config.settings import Settings


def create_pool(settings: Settings) -> MySQLConnectionPool:
    tls_options = (
        {"ssl_ca": settings.mysql_ssl_ca, "ssl_verify_cert": True, "ssl_verify_identity": True}
        if settings.mysql_ssl_ca else {}
    )
    return MySQLConnectionPool(
        pool_name="ostrix_sync_pool",
        pool_size=5,
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
        autocommit=False,
        connection_timeout=10,
        charset="utf8mb4",
        use_pure=True,
        **tls_options,
    )
