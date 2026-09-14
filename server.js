const express = require('express');
const fetch = require('node-fetch');
const { URL } = require('url');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

// Main proxy endpoint
app.get('/proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
      return res.status(400).send('Missing URL parameter');
    }

    // Validate URL
    let fullUrl = targetUrl;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }

    // Fetch the page
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124'
      },
      timeout: 15000
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
    }

    let html = await response.text();
    
    // Parse and rewrite HTML
    const $ = cheerio.load(html);
    const baseUrl = new URL(fullUrl);

    // Rewrite all links to go through proxy
    $('a[href]').each((i, el) => {
      let href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, fullUrl).href;
          $(el).attr('href', `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Rewrite form actions
    $('form[action]').each((i, el) => {
      let action = $(el).attr('action');
      if (action) {
        try {
          const absoluteUrl = new URL(action, fullUrl).href;
          $(el).attr('action', `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Rewrite script sources
    $('script[src]').each((i, el) => {
      let src = $(el).attr('src');
      if (src && !src.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(src, fullUrl).href;
          $(el).attr('src', `/proxy-resource?url=${encodeURIComponent(absoluteUrl)}`);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Rewrite stylesheet links
    $('link[href]').each((i, el) => {
      let href = $(el).attr('href');
      if (href && !href.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(href, fullUrl).href;
          $(el).attr('href', `/proxy-resource?url=${encodeURIComponent(absoluteUrl)}`);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Rewrite image sources
    $('img[src]').each((i, el) => {
      let src = $(el).attr('src');
      if (src && !src.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(src, fullUrl).href;
          $(el).attr('src', `/proxy-resource?url=${encodeURIComponent(absoluteUrl)}`);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });

    // Inject base tag for relative URL resolution
    if (!$('base').length) {
      $('head').prepend(`<base href="${fullUrl}">`);
    }

    // Inject proxy script for XHR/Fetch interception
    const proxyScript = `
      <script>
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          let url = args[0];
          if (typeof url === 'string' && !url.startsWith('data:')) {
            try {
              url = new URL(url, '${fullUrl}').href;
              args[0] = '/proxy-resource?url=' + encodeURIComponent(url);
            } catch(e) {}
          }
          return originalFetch.apply(this, args);
        };
      </script>
    `;
    $('head').append(proxyScript);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send(`<pre>Error: ${error.message}</pre>`);
  }
});

// Resource proxy (images, CSS, JS, etc.)
app.get('/proxy-resource', async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send('Missing URL parameter');
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124',
        'Referer': req.query.referer || ''
      },
      timeout: 15000
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch resource');
    }

    // Forward content type and other headers
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    response.body.pipe(res);
  } catch (error) {
    console.error('Resource proxy error:', error);
    res.status(500).send('Error fetching resource');
  }
});

app.listen(PORT, () => {
  console.log(`WHAMMIEE WEB Proxy running on http://localhost:${PORT}`);
});
