/**
 * Course Covers Catalog — OstrixAi / BuildHybridAI 2026
 * 10 Official Peruvian Secondary Curriculum Covers + 5 Alternative Covers for Custom Subjects
 * 100% Offline-first: Rich SVG vector illustrations and gradients with zero external network requests.
 */

export interface CourseCover {
  readonly id: string;
  readonly name: string;
  readonly category: 'curricular' | 'custom';
  readonly accentColor: string;
  readonly gradient: string;
  readonly darkGradient: string;
  readonly iconPath: string;
  readonly illustrationSvg: string;
}

export const COURSE_COVERS: readonly CourseCover[] = [
  // 1. MATEMÁTICA (Geometría, números, fórmulas, figuras, diagramas)
  {
    id: 'matematica',
    name: 'Matemática',
    category: 'curricular',
    accentColor: '#2563eb',
    gradient: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #60a5fa 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(30,58,138,0.92) 0%, rgba(37,99,235,0.85) 100%)',
    iconPath: 'M4 19h16v2H4zm3-8h2v6H7zm4-4h2v10h-2zm4-4h2v14h-2z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <circle cx="80" cy="80" r="64" stroke="rgba(255,255,255,0.22)" stroke-width="2" stroke-dasharray="6 6"/>
        <circle cx="80" cy="80" r="48" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
        <!-- Triángulo rectángulo y compás geométrico -->
        <path d="M40 115 L120 115 L120 45 Z" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.12)"/>
        <rect x="105" y="100" width="15" height="15" stroke="rgba(255,255,255,0.8)" stroke-width="2" fill="none"/>
        <path d="M40 115 Q80 75 120 45" stroke="#93c5fd" stroke-width="2.5" stroke-dasharray="4 3"/>
        <circle cx="40" cy="115" r="4.5" fill="#bfdbfe"/>
        <circle cx="120" cy="115" r="4.5" fill="#bfdbfe"/>
        <circle cx="120" cy="45" r="4.5" fill="#bfdbfe"/>
        <!-- Fórmulas y símbolos matemáticos -->
        <text x="65" y="70" font-size="16" font-family="system-ui, -apple-system, sans-serif" font-weight="900" fill="#ffffff" opacity="0.95">π</text>
        <text x="92" y="88" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="800" fill="#dbeafe" opacity="0.95">√x</text>
        <text x="48" y="102" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="#bfdbfe">f(x)</text>
        <path d="M28 40 L44 40 M36 32 L36 48" stroke="#93c5fd" stroke-width="2" stroke-linecap="round"/>
        <path d="M126 30 L140 30" stroke="#93c5fd" stroke-width="2" stroke-linecap="round"/>
        <path d="M126 36 L140 36" stroke="#93c5fd" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
  },

  // 2. COMUNICACIÓN (Libros, escritura, literatura, lectura, letras)
  {
    id: 'comunicacion',
    name: 'Comunicación',
    category: 'curricular',
    accentColor: '#059669',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #059669 50%, #34d399 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(6,78,59,0.92) 0%, rgba(5,150,105,0.85) 100%)',
    iconPath: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Libro abierto en perspectiva -->
        <path d="M28 60 C28 52, 70 46, 80 58 C90 46, 132 52, 132 60 L132 112 C132 112, 90 106, 80 118 C70 106, 28 112, 28 112 Z" 
              fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <path d="M80 58 L80 118" stroke="rgba(255,255,255,0.95)" stroke-width="3"/>
        <!-- Líneas de lectura estilizadas -->
        <path d="M40 72 H70 M40 82 H68 M40 92 H64" stroke="#a7f3d0" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M90 72 H120 M90 82 H118 M90 92 H114" stroke="#a7f3d0" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Pluma caligráfica clásica -->
        <path d="M125 35 C135 25, 142 32, 132 46 L108 80 L102 74 Z" fill="#6ee7b7" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
        <path d="M102 74 L96 86 L108 80 Z" fill="#ffffff"/>
        <!-- Letras y símbolos literarios flotantes -->
        <text x="35" y="44" font-size="20" font-family="serif" font-weight="bold" fill="#ffffff" opacity="0.9">A</text>
        <text x="58" y="36" font-size="16" font-family="serif" font-style="italic" fill="#a7f3d0" opacity="0.9">✍</text>
      </svg>
    `,
  },

  // 3. CIENCIA Y TECNOLOGÍA (Laboratorio, moléculas, microscopio, circuitos, experimentos)
  {
    id: 'ciencia-tecnologia',
    name: 'Ciencia y Tecnología',
    category: 'curricular',
    accentColor: '#7c3aed',
    gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #a78bfa 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(76,29,149,0.92) 0%, rgba(124,58,237,0.85) 100%)',
    iconPath: 'M9 2v2H8v5.5l-4.5 9c-.5 1 .2 2.5 1.5 2.5h14c1.3 0 2-1.5 1.5-2.5L16 9.5V4h-1V2H9zm2 4h2v3.5l.5 1 3 6H7.5l3-6 .5-1V6z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Matraz de laboratorio con reacción química -->
        <path d="M68 35 H92 V54 L114 104 C118 112 112 120 102 120 H58 C48 120 42 112 46 104 L68 54 Z" 
              stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="none"/>
        <path d="M54 98 Q80 90 106 98 L110 114 H50 Z" fill="rgba(255,255,255,0.28)"/>
        <!-- Burbujas del experimento -->
        <circle cx="66" cy="104" r="4.5" fill="#ddd6fe"/>
        <circle cx="88" cy="100" r="3.5" fill="#c4b5fd"/>
        <circle cx="78" cy="110" r="3" fill="#ffffff"/>
        <circle cx="82" cy="80" r="3" fill="#ddd6fe" opacity="0.8"/>
        <!-- Órbita atómica con electrón -->
        <ellipse cx="120" cy="50" rx="26" ry="10" transform="rotate(-30 120 50)" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>
        <ellipse cx="120" cy="50" rx="26" ry="10" transform="rotate(30 120 50)" stroke="#c4b5fd" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="120" cy="50" r="5" fill="#ffffff"/>
        <circle cx="138" cy="40" r="3" fill="#a78bfa"/>
        <!-- Pistas de circuito tecnológico -->
        <path d="M25 60 H42 L48 70" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round"/>
        <circle cx="25" cy="60" r="3" fill="#a78bfa"/>
      </svg>
    `,
  },

  // 4. CIENCIAS SOCIALES (Mapas, historia, geografía, civilizaciones)
  {
    id: 'ciencias-sociales',
    name: 'Ciencias Sociales',
    category: 'curricular',
    accentColor: '#d97706',
    gradient: 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(120,53,15,0.92) 0%, rgba(180,83,9,0.85) 100%)',
    iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Globo terráqueo con red geográfica -->
        <circle cx="75" cy="80" r="50" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.08)"/>
        <path d="M75 30 C52 50 52 110 75 130" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        <path d="M75 30 C98 50 98 110 75 130" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        <path d="M27 68 C50 76 100 76 123 68" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        <path d="M27 92 C50 100 100 100 123 92" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
        <!-- Silueta de pirámide / templo de civilización antigua -->
        <polygon points="110,125 145,125 128,88" stroke="#fde68a" stroke-width="2.5" fill="rgba(255,255,255,0.2)"/>
        <polygon points="120,125 152,125 138,98" stroke="#fde68a" stroke-width="1.8" fill="rgba(255,255,255,0.12)"/>
        <!-- Rosa de los vientos / Brújula -->
        <circle cx="40" cy="40" r="14" stroke="#fde68a" stroke-width="1.5"/>
        <path d="M40 28 L43 38 L52 40 L43 42 L40 52 L37 42 L28 40 L37 38 Z" fill="#ffffff"/>
      </svg>
    `,
  },

  // 5. DESARROLLO PERSONAL, CIUDADANÍA Y CÍVICA (DPCC: Comunidad, convivencia, diálogo)
  {
    id: 'dpcc',
    name: 'Desarrollo Personal, Ciudadanía y Cívica',
    category: 'curricular',
    accentColor: '#e11d48',
    gradient: 'linear-gradient(135deg, #881337 0%, #e11d48 50%, #fb7185 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(136,19,55,0.92) 0%, rgba(225,29,72,0.85) 100%)',
    iconPath: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Siluetas de comunidad dialogando -->
        <circle cx="80" cy="55" r="18" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.18)"/>
        <path d="M46 118 C46 95 62 86 80 86 C98 86 114 95 114 118" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="none"/>
        <circle cx="44" cy="68" r="13" stroke="#fecdd3" stroke-width="2.2" fill="rgba(255,255,255,0.1)"/>
        <path d="M20 118 C20 102 32 94 44 94 C50 94 56 96 60 99" stroke="#fecdd3" stroke-width="2.2" fill="none"/>
        <circle cx="116" cy="68" r="13" stroke="#fecdd3" stroke-width="2.2" fill="rgba(255,255,255,0.1)"/>
        <path d="M100 99 C104 96 110 94 116 94 C128 94 140 102 140 118" stroke="#fecdd3" stroke-width="2.2" fill="none"/>
        <!-- Corazón / Emblema cívico central -->
        <path d="M80 62 C76 56 70 56 66 60 C60 66 68 74 80 80 C92 74 100 66 94 60 C90 56 84 56 80 62 Z" fill="#ffffff" opacity="0.9"/>
      </svg>
    `,
  },

  // 6. INGLÉS (Idiomas, conversación, vocabulario, comunicación internacional)
  {
    id: 'ingles',
    name: 'Inglés',
    category: 'curricular',
    accentColor: '#0284c7',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #38bdf8 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(12,74,110,0.92) 0%, rgba(2,132,199,0.85) 100%)',
    iconPath: 'M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Bocadillos de conversación superpuestos -->
        <rect x="25" y="45" width="85" height="58" rx="14" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.18)"/>
        <path d="M48 103 L40 118 L62 103" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" fill="rgba(255,255,255,0.18)"/>
        <text x="67" y="82" font-size="22" font-family="system-ui, -apple-system, sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">HELLO</text>
        <!-- Segundo bocadillo global -->
        <rect x="75" y="75" width="65" height="45" rx="10" stroke="#bae6fd" stroke-width="2.2" fill="rgba(12,74,110,0.7)"/>
        <path d="M115 120 L124 130 L126 120" stroke="#bae6fd" stroke-width="2" fill="none"/>
        <text x="107" y="104" font-size="15" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" fill="#bae6fd" text-anchor="middle">WORLD</text>
        <circle cx="125" cy="42" r="3.5" fill="#38bdf8"/>
        <circle cx="138" cy="50" r="2.5" fill="#bae6fd"/>
      </svg>
    `,
  },

  // 7. EDUCACIÓN PARA EL TRABAJO (EPT: Tecnología, herramientas, emprendimiento)
  {
    id: 'ept',
    name: 'Educación para el Trabajo',
    category: 'curricular',
    accentColor: '#0d9488',
    gradient: 'linear-gradient(135deg, #134e4a 0%, #0d9488 50%, #2dd4bf 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(19,78,74,0.92) 0%, rgba(13,148,136,0.85) 100%)',
    iconPath: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Engranaje tecnológico central -->
        <circle cx="80" cy="80" r="24" stroke="rgba(255,255,255,0.9)" stroke-width="3.5" fill="rgba(255,255,255,0.15)"/>
        <path d="M80 42 V52 M80 108 V118 M42 80 H52 M108 80 H118" stroke="rgba(255,255,255,0.95)" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M53 53 L60 60 M100 100 L107 107 M107 53 L100 60 M60 100 L53 107" stroke="rgba(255,255,255,0.95)" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="80" cy="80" r="10" fill="#99f6e4"/>
        <!-- Cohete de emprendimiento e innovación -->
        <path d="M125 35 C135 45, 130 65, 115 75 L108 68 L115 52 Z" fill="#2dd4bf" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="120" cy="50" r="3" fill="#ffffff"/>
      </svg>
    `,
  },

  // 8. ARTE Y CULTURA (Pintura, música, artes escénicas, expresión)
  {
    id: 'arte-cultura',
    name: 'Arte y Cultura',
    category: 'curricular',
    accentColor: '#9333ea',
    gradient: 'linear-gradient(135deg, #581c87 0%, #9333ea 50%, #c084fc 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(88,28,135,0.92) 0%, rgba(147,51,234,0.85) 100%)',
    iconPath: 'M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.23 19.64 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-4.5 9c-.83 0-1.5-.67-1.5-1.5S6.67 9 7.5 9s1.5.67 1.5 1.5S8.33 12 7.5 12zm3-4c-.83 0-1.5-.67-1.5-1.5S9.67 5 10.5 5s1.5.67 1.5 1.5S11.33 8 10.5 8zm3 0c-.83 0-1.5-.67-1.5-1.5S12.67 5 13.5 5s1.5.67 1.5 1.5S14.33 8 13.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S15.67 9 16.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Paleta artística con pigmentos -->
        <path d="M80 32 C48 32 35 58 35 84 C35 110 60 125 86 125 C100 125 106 118 106 112 C106 106 100 100 112 100 C122 100 126 86 126 74 C126 50 106 32 80 32 Z" 
              fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <circle cx="60" cy="58" r="6" fill="#f472b6"/>
        <circle cx="82" cy="52" r="6" fill="#facc15"/>
        <circle cx="104" cy="65" r="6" fill="#38bdf8"/>
        <circle cx="60" cy="85" r="6" fill="#4ade80"/>
        <!-- Pincel con punta de oro -->
        <path d="M90 114 L122 40" stroke="#f3e8ff" stroke-width="4" stroke-linecap="round"/>
        <polygon points="122,40 128,32 118,34" fill="#facc15"/>
        <!-- Clave de sol / nota musical -->
        <circle cx="138" cy="98" r="5" fill="#e9d5ff"/>
        <path d="M143 98 V75 M143 75 Q150 80 152 70" stroke="#e9d5ff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    `,
  },

  // 9. EDUCACIÓN FÍSICA (Deporte, actividad física, movimiento)
  {
    id: 'educacion-fisica',
    name: 'Educación Física',
    category: 'curricular',
    accentColor: '#ea580c',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fb923c 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(124,45,18,0.92) 0%, rgba(234,88,12,0.85) 100%)',
    iconPath: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.8-1.6 8.1-4.9-.9-.4 2 6.5 1.2z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Atleta en dinamismo de carrera -->
        <circle cx="56" cy="46" r="9" stroke="rgba(255,255,255,0.95)" stroke-width="3" fill="none"/>
        <path d="M54 56 L42 84 L65 94 L60 124" stroke="rgba(255,255,255,0.95)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M46 68 L74 65 L100 78" stroke="rgba(255,255,255,0.95)" stroke-width="4" stroke-linecap="round" fill="none"/>
        <!-- Cronómetro / Ondas de velocidad -->
        <circle cx="114" cy="74" r="18" stroke="#fed7aa" stroke-width="2.5" stroke-dasharray="4 4"/>
        <circle cx="114" cy="74" r="10" fill="rgba(255,255,255,0.3)"/>
        <path d="M114 68 V74 H119" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
        <path d="M25 124 H135" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `,
  },

  // 10. EDUCACIÓN RELIGIOSA (Reflexión, convivencia, valores)
  {
    id: 'educacion-religiosa',
    name: 'Educación Religiosa',
    category: 'curricular',
    accentColor: '#4f46e5',
    gradient: 'linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #818cf8 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(49,46,129,0.92) 0%, rgba(79,70,229,0.85) 100%)',
    iconPath: 'M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Lámpara / Manantial de reflexión y valores -->
        <path d="M80 32 C60 52 60 98 80 125 C100 98 100 52 80 32 Z" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.18)"/>
        <circle cx="80" cy="72" r="10" fill="#e0e7ff"/>
        <path d="M40 85 Q80 72 120 85" stroke="#c7d2fe" stroke-width="2.5"/>
        <circle cx="80" cy="28" r="4" fill="#a5b4fc"/>
        <!-- Resplandor estelar de valores -->
        <path d="M80 14 V24 M80 132 V142 M24 72 H34 M126 72 H136" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
  },

  // ================= 5 PORTADAS GENÉRICAS PARA CURSOS PERSONALIZADOS =================
  // 11. GENÉRICO 1: BIBLIOTECA & CONOCIMIENTO
  {
    id: 'generico-biblioteca',
    name: 'Biblioteca & Conocimiento',
    category: 'custom',
    accentColor: '#475569',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #475569 50%, #94a3b8 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(30,41,59,0.94) 0%, rgba(71,85,105,0.88) 100%)',
    iconPath: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Estante de libros del saber universal -->
        <rect x="40" y="40" width="20" height="78" rx="3" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" fill="rgba(255,255,255,0.18)"/>
        <rect x="68" y="50" width="20" height="68" rx="3" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" fill="rgba(255,255,255,0.28)"/>
        <rect x="96" y="34" width="20" height="84" rx="3" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" fill="rgba(255,255,255,0.18)"/>
        <line x1="28" y1="118" x2="132" y2="118" stroke="white" stroke-width="4" stroke-linecap="round"/>
        <path d="M47 52 H53 M47 60 H53 M75 62 H81 M103 46 H109" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `,
  },

  // 12. GENÉRICO 2: TECNOLOGÍA ABSTRACTA (Circuitos, Nodos, Inteligencia)
  {
    id: 'generico-innovacion',
    name: 'Tecnología abstracta & Circuitos',
    category: 'custom',
    accentColor: '#0284c7',
    gradient: 'linear-gradient(135deg, #0f172a 0%, #0369a1 50%, #38bdf8 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(15,23,42,0.94) 0%, rgba(3,105,161,0.88) 100%)',
    iconPath: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Chip de circuito abstracto y nodos conectados -->
        <rect x="52" y="52" width="56" height="56" rx="10" stroke="rgba(255,255,255,0.9)" stroke-width="3" fill="rgba(255,255,255,0.15)"/>
        <circle cx="80" cy="80" r="14" stroke="#38bdf8" stroke-width="2.5" fill="rgba(56,189,248,0.25)"/>
        <line x1="80" y1="32" x2="80" y2="52" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <line x1="80" y1="108" x2="80" y2="128" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <line x1="32" y1="80" x2="52" y2="80" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <line x1="108" y1="80" x2="128" y2="80" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <circle cx="80" cy="32" r="4" fill="#ffffff"/>
        <circle cx="80" cy="128" r="4" fill="#ffffff"/>
        <circle cx="32" cy="80" r="4" fill="#ffffff"/>
        <circle cx="128" cy="80" r="4" fill="#ffffff"/>
      </svg>
    `,
  },

  // 13. GENÉRICO 3: NATURALEZA Y DESCUBRIMIENTO
  {
    id: 'generico-naturaleza',
    name: 'Naturaleza & Descubrimiento',
    category: 'custom',
    accentColor: '#15803d',
    gradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #86efac 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(20,83,45,0.94) 0%, rgba(21,128,61,0.88) 100%)',
    iconPath: 'M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Hojas botánicas orgánicas y brote de vida -->
        <path d="M80 115 C80 75 48 60 48 40 C68 40 88 55 80 115 Z" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <path d="M80 115 C80 75 112 60 112 40 C92 40 72 55 80 115 Z" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <line x1="80" y1="115" x2="80" y2="55" stroke="#bbf7d0" stroke-width="3" stroke-linecap="round"/>
        <circle cx="80" cy="124" r="4" fill="#86efac"/>
        <circle cx="120" cy="35" r="10" fill="#facc15" opacity="0.85"/>
      </svg>
    `,
  },

  // 14. GENÉRICO 4: ESPACIO, GEOMETRÍA & SABERES ORIGINARIOS
  {
    id: 'generico-cultura',
    name: 'Espacio, Geometría & Saberes',
    category: 'custom',
    accentColor: '#c2410c',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 50%, #fed7aa 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(124,45,18,0.94) 0%, rgba(194,65,12,0.88) 100%)',
    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Cruz Chakana andina y constelaciones -->
        <path d="M68 40 H92 V54 H106 V68 H120 V92 H106 V106 H92 V120 H68 V106 H54 V92 H40 V68 H54 V54 H68 Z" 
              fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <circle cx="80" cy="80" r="14" stroke="white" stroke-width="2.5" fill="none"/>
        <circle cx="80" cy="80" r="5" fill="#ffedd5"/>
        <circle cx="34" cy="38" r="2.5" fill="#ffffff"/>
        <circle cx="126" cy="38" r="2.5" fill="#ffffff"/>
      </svg>
    `,
  },

  // 15. GENÉRICO 5: SALUD, PSICOLOGÍA & BIENESTAR
  {
    id: 'generico-salud',
    name: 'Salud & Bienestar',
    category: 'custom',
    accentColor: '#be185d',
    gradient: 'linear-gradient(135deg, #831843 0%, #be185d 50%, #fbcfe8 100%)',
    darkGradient: 'linear-gradient(135deg, rgba(131,24,67,0.94) 0%, rgba(190,24,93,0.88) 100%)',
    iconPath: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    illustrationSvg: `
      <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" class="cover-art">
        <!-- Corazón con pulso vital y bienestar -->
        <path d="M80 118 L70 108 C40 80 30 68 30 52 C30 38 40 28 54 28 C64 28 74 34 80 43 C86 34 96 28 106 28 C120 28 130 38 130 52 C130 68 120 80 90 108 Z" 
              fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.9)" stroke-width="3"/>
        <path d="M52 70 H64 L72 54 L84 86 L92 70 H108" stroke="#fbcfe8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
  },
];

/**
 * Normalizes an arbitrary text string by removing diacritics and converting to lowercase.
 */
function normalizeName(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Finds the most suitable cover for a given course name or returns a fallback cover.
 * Recognizes curricular areas and independent subjects:
 * Física, Química, Biología, Álgebra, Aritmética, Geometría, Trigonometría, Historia, Literatura.
 */
export function matchCourseCover(courseName: string, explicitCoverId?: string | null): CourseCover {
  if (explicitCoverId) {
    const found = COURSE_COVERS.find(c => c.id === explicitCoverId);
    if (found) return found;
  }

  const norm = normalizeName(courseName);

  // 1. Matemática y ramas afines (Álgebra, Aritmética, Geometría, Trigonometría, Cálculo)
  if (norm.includes('matemat') || norm.includes('algebra') || norm.includes('aritmet') || 
      norm.includes('geometr') || norm.includes('trigono') || norm.includes('calculo') || norm.includes('estadistica')) {
    return COURSE_COVERS[0]; // matematica
  }

  // 2. Comunicación y literatura (Lengua, Literatura, Redacción, Lectura)
  if (norm.includes('comunica') || norm.includes('literatur') || norm.includes('lengua') || 
      norm.includes('lectur') || norm.includes('redacc') || norm.includes('gramatica')) {
    return COURSE_COVERS[1]; // comunicacion
  }

  // 3. Ciencia y Tecnología y ramas de ciencias naturales (Física, Química, Biología)
  if ((norm.includes('ciencia') && (norm.includes('tecnolog') || norm.includes('ambiente') || norm.includes('natural'))) ||
      norm.includes('fisica') || norm.includes('quimica') || norm.includes('biolog') || 
      norm.includes('laboratorio') || norm.includes('anatomia')) {
    return COURSE_COVERS[2]; // ciencia-tecnologia
  }

  // 4. Ciencias Sociales e Historia / Geografía
  if (norm.includes('social') || norm.includes('historia') || norm.includes('geograf') || 
      norm.includes('economia') || norm.includes('antropolog')) {
    return COURSE_COVERS[3]; // ciencias-sociales
  }

  // 5. Desarrollo Personal, Ciudadanía y Cívica (DPCC)
  if (norm.includes('desarrollo personal') || norm.includes('ciudadan') || norm.includes('civica') || 
      norm.includes('dpcc') || norm.includes('valores') || norm.includes('convivencia')) {
    return COURSE_COVERS[4]; // dpcc
  }

  // 6. Inglés e idiomas extranjeros
  if (norm.includes('ingles') || norm.includes('english') || norm.includes('idioma extranjero') || norm.includes('frances')) {
    return COURSE_COVERS[5]; // ingles
  }

  // 7. Educación para el Trabajo (EPT, robótica, computación)
  if (norm.includes('trabajo') || norm.includes('ept') || norm.includes('emprend') || 
      norm.includes('computac') || norm.includes('robot') || norm.includes('tecnica')) {
    return COURSE_COVERS[6]; // ept
  }

  // 8. Arte y Cultura
  if (norm.includes('arte') || norm.includes('cultura') || norm.includes('musica') || 
      norm.includes('danza') || norm.includes('teatro') || norm.includes('dibujo') || norm.includes('pintura')) {
    return COURSE_COVERS[7]; // arte-cultura
  }

  // 9. Educación Física y Deportes
  if ((norm.includes('fisica') && norm.includes('educ')) || norm.includes('deporte') || 
      norm.includes('recreac') || norm.includes('atletismo')) {
    return COURSE_COVERS[8]; // educacion-fisica
  }

  // 10. Educación Religiosa
  if (norm.includes('religio') || norm.includes('espirit') || norm.includes('teolog') || norm.includes('fe')) {
    return COURSE_COVERS[9]; // educacion-religiosa
  }

  // 11. Heurísticas para cursos personalizados alternativos
  // Saberes Originarios, Filosofía, Espacio, Astronomía, Geometría creativa
  if (norm.includes('filosof') || norm.includes('andina') || norm.includes('quechua') || 
      norm.includes('aymara') || norm.includes('originari') || norm.includes('astronom') || norm.includes('espacio')) {
    return COURSE_COVERS[13]; // generico-cultura (Chakana y cosmos)
  }

  // Naturaleza, Agroecología, Ecología
  if (norm.includes('agro') || norm.includes('ecolog') || norm.includes('medio ambiente') || 
      norm.includes('tierra') || norm.includes('botan') || norm.includes('naturaleza')) {
    return COURSE_COVERS[12]; // generico-naturaleza
  }

  // Salud, Psicología, Bienestar, Nutrición
  if (norm.includes('salud') || norm.includes('psicolog') || norm.includes('emocion') || 
      norm.includes('bienestar') || norm.includes('nutric')) {
    return COURSE_COVERS[14]; // generico-salud
  }

  // Innovación, Tecnología abstracta, Proyectos, Investigación
  if (norm.includes('innov') || norm.includes('proyect') || norm.includes('investig') || 
      norm.includes('tecnolog') || norm.includes('digital') || norm.includes('software')) {
    return COURSE_COVERS[11]; // generico-innovacion
  }

  // Default fallback: Biblioteca & Conocimiento
  return COURSE_COVERS[10]; // generico-biblioteca
}
