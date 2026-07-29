const https = require('https');
const options = {
  hostname: 'generativelanguage.googleapis.com',
  port: 443,
  path: '/v1beta/models/gemini-2.0-flash:generateContent',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', e => console.error(e));
req.write(JSON.stringify({
  contents: [{parts: [{text: "Hello"}]}]
}));
req.end();
