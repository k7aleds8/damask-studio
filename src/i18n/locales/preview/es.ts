import type { preview as en } from './en';

export const preview: typeof en = {
  show: 'Vista previa',
  close: 'Cerrar',
  now: 'Ahora',
  after: 'Después',
  on: 'Activado',
  off: 'Desactivado',
  setting: 'Vistas previas de opciones',
  settingDesc: 'Una animación breve te enseña qué cambia antes de tocar una opción.',
  scenes: {
    mod: {
      home: 'Tu nota de inicio se convierte en un panel: saludo, reloj, cifras de la bóveda y tu día de un vistazo.',
      inserter: 'Añade «Insertar bloque» al menú del editor, junto con la galería de bloques y sus atajos.',
      embeds: 'Maqueta dibujos e imágenes —alineación, ancho, marco— con una barra de herramientas al pasar el ratón.',
      folders: 'Da color a cada carpeta principal y a todo lo que contiene, con guías a lo largo del árbol.',
      headings: 'Cada nivel de encabezado tiene su propio color y estilo en todas tus notas.',
      variants: 'Elige la paleta del tema para el modo oscuro y el claro desde este mismo panel.',
      pomodoro: 'Añade un temporizador de concentración: un botón en la cinta, un panel lateral y una cuenta atrás en la barra de estado.',
      health: 'Busca enlaces rotos, notas vacías y archivos sueltos, y los arregla con un clic.',
      ticktick: 'Activado, las estadísticas de tareas y concentración vienen de TickTick. Desactivado, se calculan a partir de tus notas.',
    },
    ins: {
      menu: 'Haz clic derecho en una nota y encontrarás «Insertar bloque» en el menú.',
      suggest: 'Escribe ;; en cualquier línea para elegir un bloque sin soltar el teclado.',
      ribbon: 'Un botón de la galería en la cinta, a un clic de cualquier nota.',
    },
    emb: {
      enabled: 'Aplica tu diseño por defecto a cada dibujo. Desactivado, Obsidian los muestra tal cual.',
      toolbar: 'Aparece una pequeña barra de diseño al pasar el ratón sobre un dibujo o una imagen.',
      trigger: '¿La barra aparece con solo pasar el ratón, o únicamente mientras mantienes Alt?',
      images: 'El mismo diseño para las imágenes normales, no solo para los dibujos de Excalidraw.',
      align: 'Dónde se coloca el dibujo de un lado a otro de la página.',
      width: 'Qué parte del ancho de la página ocupa; auto respeta su tamaño original.',
      maxWidth: 'Un tope de ancho para que los dibujos grandes no se estiren sin fin en pantallas amplias.',
      frame: 'El marco que rodea el dibujo.',
      shadow: 'Una sombra suave que despega el dibujo de la página.',
      invert: 'Invierte los colores de un dibujo claro para que encaje en una página oscura.',
    },
  },
};
