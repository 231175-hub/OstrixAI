-- OstrixAi Migration 002: Academic Journal & Learning Memory Full Sync
-- Non-destructive: preserves existing sync_events table and data.
USE ostrixai;

-- 1. Estudiantes e Identidades autenticadas
CREATE TABLE IF NOT EXISTS students (
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    current_grade TINYINT UNSIGNED NOT NULL DEFAULT 1,
    preferred_language VARCHAR(16) NOT NULL DEFAULT 'es',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    last_sync_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

-- 2. Sesiones del Diario Académico (Fecha -> Curso -> Sesión -> Contenido)
CREATE TABLE IF NOT EXISTS academic_sessions (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    session_date DATE NOT NULL,
    grade TINYINT UNSIGNED NOT NULL DEFAULT 1,
    course_id VARCHAR(32) NOT NULL,
    course_name VARCHAR(128) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    notes_text MEDIUMTEXT NOT NULL,
    summary_text MEDIUMTEXT NULL,
    summary_quechua MEDIUMTEXT NULL,
    review_questions MEDIUMTEXT NULL,
    review_quechua MEDIUMTEXT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    sync_status ENUM('PENDING', 'SYNCED') NOT NULL DEFAULT 'SYNCED',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_user_date (user_uid, session_date DESC),
    INDEX idx_user_course (user_uid, course_name),
    INDEX idx_user_updated (user_uid, updated_at DESC)
) ENGINE=InnoDB;

-- 3. Dudas y Descubrimientos Eureka de la sesión
CREATE TABLE IF NOT EXISTS session_concepts (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    collection_type ENUM('DOUBT', 'EUREKA') NOT NULL,
    concept_text VARCHAR(500) NOT NULL,
    order_index INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    INDEX idx_session (session_id),
    INDEX idx_user_collection (user_uid, collection_type)
) ENGINE=InnoDB;

-- 4. Memoria de Aprendizaje Real (Dudas -> Explicación -> Evaluación -> Repaso -> Progreso)
CREATE TABLE IF NOT EXISTS learning_memory_items (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    course_name VARCHAR(128) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    concept_text VARCHAR(500) NOT NULL,
    status ENUM('PENDING', 'EXPLAINED', 'TESTED', 'MASTERED', 'REINFORCING') NOT NULL DEFAULT 'PENDING',
    explanation_text MEDIUMTEXT NULL,
    explanation_source ENUM('ON_DEVICE', 'IN_CLOUD', 'CURRICULUM_OFFLINE') NULL,
    repetitions INT UNSIGNED NOT NULL DEFAULT 0,
    streak INT UNSIGNED NOT NULL DEFAULT 0,
    interval_days INT UNSIGNED NOT NULL DEFAULT 1,
    ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.50,
    next_review_date DATE NOT NULL,
    last_reviewed_date DATE NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    INDEX idx_user_next_review (user_uid, next_review_date),
    INDEX idx_user_status (user_uid, status)
) ENGINE=InnoDB;

-- 5. Resultados de Repaso y Evaluaciones Deterministas
CREATE TABLE IF NOT EXISTS learning_review_results (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    concept_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    exercise_id VARCHAR(64) NULL,
    score TINYINT UNSIGNED NOT NULL,
    is_correct BOOLEAN NOT NULL,
    review_date DATE NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_user_concept (user_uid, concept_id)
) ENGINE=InnoDB;

-- 6. Glosario Educativo Revisado (Español <-> Quechua Chanka)
CREATE TABLE IF NOT EXISTS educational_glossary (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    term_es VARCHAR(255) NOT NULL UNIQUE,
    term_qu_chanka VARCHAR(255) NOT NULL,
    domain VARCHAR(64) NOT NULL,
    validation_source VARCHAR(128) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

-- 7. Mecanismo de Retroalimentación y Correcciones Lingüísticas
CREATE TABLE IF NOT EXISTS linguistic_corrections (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    term_spanish VARCHAR(255) NOT NULL,
    translated_quechua VARCHAR(500) NOT NULL,
    suggested_chanka VARCHAR(500) NOT NULL,
    community_context VARCHAR(255) NULL,
    status ENUM('PROPOSED', 'VALIDATED', 'REJECTED') NOT NULL DEFAULT 'PROPOSED',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_term (term_spanish)
) ENGINE=InnoDB;

-- Precargar términos clave del glosario escolar Quechua Chanka
INSERT INTO educational_glossary (id, term_es, term_qu_chanka, domain, validation_source) VALUES
('glo-01', 'matemática', 'yupana / yupay yachay', 'Matemática', 'Docentes EIB Ayacucho 2026'),
('glo-02', 'fracción', 'rakiy / patma', 'Matemática', 'Docentes EIB Ayacucho 2026'),
('glo-03', 'denominador', 'rakiq yupay', 'Matemática', 'Vocabulario curricular Minedu EIB'),
('glo-04', 'numerador', 'aymurraq yupay', 'Matemática', 'Vocabulario curricular Minedu EIB'),
('glo-05', 'célula', 'kawsayku', 'Ciencia y Tecnología', 'Academia Mayor de la Lengua Quechua'),
('glo-06', 'fotosíntesis', 'intipa kallpanwan kawsachiy', 'Ciencia y Tecnología', 'Docentes EIB Andahuaylas'),
('glo-07', 'oxígeno', 'kawsay wayra', 'Ciencia y Tecnología', 'Docentes EIB Andahuaylas'),
('glo-08', 'energía', 'kallpa', 'Física', 'Vocabulario Chanka estandarizado'),
('glo-09', 'fuerza', 'kallpa churay', 'Física', 'Vocabulario Chanka estandarizado'),
('glo-10', 'átomo', 'huch\'uy kurkucha', 'Química', 'Docentes EIB Ayacucho 2026'),
('glo-11', 'comunicación', 'willanakuy / rimanakuy', 'Comunicación', 'Vocabulario Chanka estandarizado'),
('glo-12', 'idea principal', 'chawpi yuyay', 'Comunicación', 'Docentes EIB Andahuaylas'),
('glo-13', 'comunidad', 'ayllu', 'Ciencias Sociales', 'Uso tradicional vivo'),
('glo-14', 'reciprocidad', 'ayni', 'Ciencias Sociales', 'Uso tradicional vivo')
ON DUPLICATE KEY UPDATE term_qu_chanka = VALUES(term_qu_chanka);
