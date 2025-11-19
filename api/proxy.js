const cheerio = require('cheerio');
const urlModule = require('url');

module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET', 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Referer': 'https://www.google.com/'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Fetch error: ${response.status} for ${targetUrl} - ${errorText}`); 
      return res.status(response.status).send(errorText);
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    res.setHeader('Content-Type', contentType);

    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");

    let body;
    if (contentType.includes('text/html')) {
      body = await response.text();

      try {
        const $ = cheerio.load(body);
        const proxyBase = `${req.protocol}://${req.headers.host}/api/proxy?url=`;
        const baseUrl = new URL(targetUrl);

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

        $('style, [style]').each(function () {
          let style = $(this).attr('style') || $(this).html();
          if (style) {
            style = style.replace(/url\s*\(['"]?([^'")]+)['"]?\s*\)/g, (match, u) => {
              const absU = makeAbsolute(u, baseUrl);
              return `url('${proxyBase + encodeURIComponent(absU)}')`;
            });
            if ($(this).is('style')) {
              $(this).html(style);
            } else {
              $(this).attr('style', style);
            }
          }
        });

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
      } catch (parseError) {
        console.log(`Cheerio parsing error for ${targetUrl}: ${parseError.message}`);
        body = await response.text();
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    }

    res.send(body);
  } catch (error) {
    console.log(`Proxy error for ${targetUrl}: ${error.message}`);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
};

function makeAbsolute(rel, base) {
  try {
    return new urlModule.URL(rel, base).href;
  } catch (e) {
    return rel;
  }
}
