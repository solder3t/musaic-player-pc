const https = require('https');
const http = require('http');

async function dohFetchBody(urlString) {
  const urlObj = new URL(urlString);
  const hostname = urlObj.hostname;
  
  // 1. Resolve via DoH directly to 1.1.1.1
  const dohUrl = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  
  const ip = await new Promise((resolve, reject) => {
    https.get(dohUrl, { 
      headers: { 
        'Accept': 'application/dns-json',
        'Host': 'cloudflare-dns.com' 
      },
      servername: 'cloudflare-dns.com'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const answer = json.Answer?.find(a => a.type === 1);
          if (answer && answer.data) resolve(answer.data);
          else reject(new Error('No A record found: ' + data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

  // 2. Fetch using IP
  return new Promise((resolve, reject) => {
    https.get({
      hostname: ip,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Host': hostname,
        'User-Agent': 'Mozilla/5.0'
      },
      servername: hostname
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

dohFetchBody('https://music.163.com/api/search/get?s=hello&type=1&offset=0&limit=1').then(console.log).catch(console.error);
