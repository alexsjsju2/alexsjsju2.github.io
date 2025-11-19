const cheerio = require('cheerio');
const urlModule = require('url');

module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    // Rimuovi header restrittive
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.set('Content-Security-Policy', "frame-ancestors *"); // Opzionale, per permettere framing

    let body;
    if (contentType.includes('text/html')) {
      body = await response.text();

      // Rewrite URLs usando cheerio
      const $ = cheerio.load(body);
      const proxyBase = `${req.protocol}://${req.headers.host}/api/proxy?url=`;
      const baseUrl = new URL(targetUrl);

      // Rewrite attributes
      const rewriteAttrs = ['href', 'src', 'action', 'poster', 'background', 'data-src', 'srcset'];
      rewriteAttrs.forEach(attr => {
        $(`[${attr}]`).each(function () {
          let val = $(this).attr(attr);
          if (val) {
            if (attr === 'srcset') {
              val = val.split(',').map(set => {
                const parts = set.trim().split(' ');
                parts[0] = makeAbsolute(parts[0], baseUrl);
                return parts.join(' ');
              }).join(', ');
            } else {
              val = makeAbsolute(val, baseUrl);
            }
            $(this).attr(attr, proxyBase + encodeURIComponent(val));
          }
        });
      });

      // Rewrite inline styles with url()
      $('style, [style]').each(function () {
        let style = $(this).attr('style') || $(this).html();
        if (style) {
          style = style.replace(/url$$ (['"]?)([^'")]+)\1 $$/g, (match, quote, u) => {
            const absU = makeAbsolute(u, baseUrl);
            return `url(${quote}${proxyBase + encodeURIComponent(absU)}${quote})`;
          });
          if ($(this).is('style')) {
            $(this).html(style);
          } else {
            $(this).attr('style', style);
          }
        }
      });

      // Simple JS rewrite for location.href etc.
      $('script').each(function () {
        let script = $(this).html();
        if (script) {
          script = script.replace(/window\.location\.href\s*=\s*(['"])([^'"]+)\1/g, (match, quote, u) => {
            const absU = makeAbsolute(u, baseUrl);
            return `window.location.href = ${quote}${proxyBase + encodeURIComponent(absU)}${quote}`;
          });
          $(this).html(script);
        }
      });

      body = $.html();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    }

    res.send(body);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

function makeAbsolute(rel, base) {
  try {
    return new urlModule.URL(rel, base).href;
  } catch (e) {
    return rel;
  }
}
