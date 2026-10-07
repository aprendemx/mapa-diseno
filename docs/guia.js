const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, ShadingType, LevelFormat, convertInchesToTwip,
} = require('docx');
const fs = require('fs');

const VERDE = '08783F';
const TINTA = '23261F';
const SUAVE = '5E635A';
const LINEA = 'DCDBD2';
const VERDE_PISO = 'E7F0E9';
const ALERTA = '9C3A22';
const ALERTA_PISO = 'FBEEEA';

const CUERPO = 'Calibri';
const DISPLAY = 'Georgia';

/** Párrafo de texto corrido. `partes` acepta cadenas o {t, b} para negritas. */
function p(partes, opciones = {}) {
  const lista = Array.isArray(partes) ? partes : [partes];
  return new Paragraph({
    spacing: { after: 160, line: 300 },
    ...opciones,
    children: lista.map((parte) =>
      typeof parte === 'string'
        ? new TextRun({ text: parte, font: CUERPO, size: 22, color: TINTA })
        : new TextRun({
            text: parte.t,
            font: CUERPO,
            size: 22,
            color: parte.c ?? TINTA,
            bold: Boolean(parte.b),
          }),
    ),
  });
}

/** Encabezado de sección, numerado: el flujo sí es una secuencia. */
function seccion(numero, texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 420, after: 140 },
    children: [
      new TextRun({ text: `${numero}  `, font: DISPLAY, size: 22, bold: true, color: VERDE }),
      new TextRun({ text: texto, font: DISPLAY, size: 26, bold: true, color: TINTA }),
    ],
  });
}

/** Bloque destacado: una franja de color a la izquierda y fondo tenue. */
function bloque(lineas, { fondo, franja, tituloColor }) {
  return lineas.map((linea, i) =>
    new Paragraph({
      spacing: { before: i === 0 ? 240 : 0, after: i === lineas.length - 1 ? 260 : 120 },
      indent: { left: convertInchesToTwip(0.18) },
      shading: { type: ShadingType.CLEAR, fill: fondo },
      border: {
        left: { style: BorderStyle.SINGLE, size: 18, color: franja, space: 8 },
      },
      children: (Array.isArray(linea) ? linea : [linea]).map((parte) =>
        typeof parte === 'string'
          ? new TextRun({ text: parte, font: CUERPO, size: 22, color: TINTA })
          : new TextRun({
              text: parte.t,
              font: parte.titulo ? DISPLAY : CUERPO,
              size: 22,
              bold: Boolean(parte.b) || Boolean(parte.titulo),
              color: parte.titulo ? (tituloColor ?? TINTA) : (parte.c ?? TINTA),
            }),
      ),
    }),
  );
}

const vineta = (partes) =>
  p(partes, { numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 90, line: 300 } });

const doc = new Document({
  numbering: {
    config: [{
      reference: 'vinetas',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: {
          paragraph: {
            indent: { left: convertInchesToTwip(0.3), hanging: convertInchesToTwip(0.18) },
          },
        },
      }],
    }],
  },
  styles: {
    default: {
      document: { run: { font: CUERPO, size: 22, color: TINTA } },
    },
  },
  sections: [{
    properties: {
      // Carta, no A4: es el tamaño que se usa acá.
      page: {
        size: { width: 12240, height: 15840 },
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1.1),
          right: convertInchesToTwip(1.1),
        },
      },
    },
    children: [
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({
          text: 'RED MÉXICO  ·  OCTUBRE 2026',
          font: DISPLAY, size: 16, bold: true, color: VERDE, characterSpacing: 40,
        })],
      }),

      new Paragraph({
        spacing: { after: 180 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: TINTA, space: 10 } },
        children: [new TextRun({
          text: 'Cómo usar el editor del mapa',
          font: DISPLAY, size: 44, bold: true, color: TINTA,
        })],
      }),

      p([{
        t: 'Ya no hay que abrir carpetas ni correr archivos .bat. Todo se hace desde el navegador, y el mapa se actualiza cuando ustedes deciden.',
        c: SUAVE,
      }], { spacing: { before: 120, after: 80, line: 300 } }),

      seccion('01', 'Entrar'),
      p([{ t: 'mapa.aprende.gob.mx/admin', b: true }]),
      p('Con el correo y la contraseña que les pasamos. Si la olvidan, no se puede recuperar: avisen y les generamos una nueva.'),

      seccion('02', 'Lo único que hay que entender'),
      ...bloque([
        [{ t: 'Guardar no es publicar.', titulo: true }],
        [
          { t: 'Guardar', b: true },
          ' deja los cambios anotados, y el mapa público sigue como estaba. ',
          { t: 'Publicar', b: true },
          ' es lo que los pone en línea.',
        ],
        ['Pueden trabajar varios días, guardar cuantas veces quieran, y publicar cuando esté completo.'],
      ], { fondo: VERDE_PISO, franja: VERDE, tituloColor: VERDE }),

      seccion('03', 'Editar un medio'),
      p('Al entrar ven la lista de medios. Hay un buscador arriba. Al abrir uno se puede cambiar:'),
      vineta([{ t: 'Nombre', b: true }, ' del medio']),
      vineta([{ t: 'Estado', b: true }, ' de donde transmite']),
      vineta([{ t: 'Notas', b: true }, ' — una por línea; cada línea sale como una nota en el mapa']),
      vineta([{ t: 'Cobertura', b: true }, ' — los estados adicionales que alcanza']),
      vineta([{ t: 'Visible', b: true }, ' — si lo desmarcan, el medio deja de aparecer pero no se borra nada']),
      p([
        'Si escriben algo entre ',
        { t: '[[corchetes dobles]]', b: true },
        ' dentro del nombre, esa parte se resalta en el mapa como nombre de lugar.',
      ], { spacing: { before: 140, after: 160, line: 300 } }),

      seccion('04', 'Subir testigos'),
      p([
        'En la sección de ',
        { t: 'Testigos', b: true },
        ', con el botón de seleccionar archivos. Se pueden subir varios de una vez y aparece una barra de progreso por cada uno. Acepta video, audio e imagen.',
      ]),
      p([
        'Las flechas ',
        { t: '↑ ↓', b: true },
        ' cambian el orden en que aparecen, y ese es el orden que verá la gente en el mapa. Los temas de redes sociales van en la misma lista, así que se pueden intercalar.',
      ]),
      p('Si quitan un archivo, sale del medio pero no se borra del servidor de inmediato. Hay tres meses de margen para pedirlo de vuelta.'),

      seccion('05', 'Publicar'),
      p([
        'En ',
        { t: 'Publicar', b: true },
        ', primero ',
        { t: 'Revisar', b: true },
        '. Eso comprueba que no falte nada: si hay un video que no subió bien o un estado mal asignado, lo dice y ',
        { t: 'no publica', b: true },
        '. Nada se rompe a medias.',
      ]),
      p([
        'Si sale limpio, ',
        { t: 'Publicar ahora', b: true },
        '. El mapa queda actualizado en segundos.',
      ]),

      seccion('06', 'Si algo sale mal'),
      p([
        'En la misma pantalla está el ',
        { t: 'historial', b: true },
        ' de todo lo que se ha publicado, con fecha y quién lo hizo. El botón ',
        { t: 'Volver a esta', b: true },
        ' devuelve el mapa a esa versión.',
      ]),
      p('Volver atrás solo cambia lo que está en línea. Lo que tengan editando no se toca.'),

      seccion('07', 'Varios mapas'),
      p('El sistema admite más de un mapa por temática. Hoy hay uno, pero si en algún momento hace falta separar Telesecundarias u otro tema, se crea desde la primera pantalla y cada uno tiene su propia dirección.'),

      ...bloque([
        [{ t: 'Está en pruebas', titulo: true }],
        ['Lleva pocos días funcionando. Úsenlo con normalidad, pero si algo se ve raro o no responde como esperaban, avisen en lugar de insistir — es más útil saberlo ahora.'],
        ['Hay respaldo diario de todo, así que no hay forma de perder trabajo de manera definitiva.'],
      ], { fondo: ALERTA_PISO, franja: ALERTA, tituloColor: ALERTA }),

      new Paragraph({
        spacing: { before: 360 },
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINEA, space: 10 } },
        children: [new TextRun({
          text: 'Dudas, una contraseña nueva o algo que no cuadre: escriban y lo vemos.',
          font: CUERPO, size: 20, color: SUAVE,
        })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(process.argv[2], buffer);
  console.log('escrito:', process.argv[2]);
});
