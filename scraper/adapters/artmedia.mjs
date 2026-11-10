// C Art Media: la página carga su agenda desde una API propia que devuelve
// { statusCode, body: "<JSON con events>" }.

export function parseArtMedia(text, baseUrl) {
  let data = JSON.parse(text);
  if (typeof data.body === 'string') data = JSON.parse(data.body);
  return (data.events || [])
    .filter((e) => String(e.Publicado ?? 'si').toLowerCase() === 'si')
    .map((e) => {
      const day = String(e.day || '').slice(0, 10);
      const m = String(e.hs || '').match(/(\d{1,2})(?:[:.](\d{2}))?/);
      const time = m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : '00:00';
      return {
        title: [e.title, e.subTitle].filter(Boolean).join(' · '),
        start: day ? `${day}T${time}:00-03:00` : null,
        place: `C Art Media${e.nave ? ` · Nave ${e.nave}` : ''}`,
        address: 'Av. Corrientes 6271, Chacarita',
        description: e.description,
        image: e.imageUrl,
        url: e.linkPago || 'https://www.ccomplejoartmedia.com.ar/events',
        category: /recital|banda|dj|m[uú]sica|jazz|rock/i.test(e.type) ? 'Música'
          : /teatro|stand/i.test(e.type) ? 'Teatro' : /fiesta/i.test(e.type) ? 'Fiestas' : undefined,
        baseUrl,
      };
    });
}
