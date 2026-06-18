const fs = require('fs');
const https = require('https');
const path = require('path');

const logoUrl = 'https://media.licdn.com/dms/image/v2/C560BAQHjnkZxrWq_UA/company-logo_200_200/company-logo_200_200/0/1631380770613?e=2147483647&v=beta&t=jLfVEuVXqkomyaIBjq1Ky2aq328LLYSP6u9f80QefQw';
const targetPath = path.join(__dirname, '..', 'public', 'logo.png');

console.log('Downloading logo from LinkedIn URL...');

const file = fs.createWriteStream(targetPath);

https.get(logoUrl, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download image: Status Code ${response.statusCode}`);
    process.exit(1);
  }
  
  response.pipe(file);
  
  file.on('finish', () => {
    file.close();
    console.log('✅ Logo successfully downloaded and saved to:', targetPath);
  });
}).on('error', (err) => {
  fs.unlink(targetPath, () => {}); // Delete local file on error
  console.error('Error downloading logo:', err.message);
  process.exit(1);
});
