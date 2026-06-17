const https = require('https');
const fs = require('fs');

const urls = {
  'mcp_dashboard.html': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1NDRhYTc5OWU1ZTEwMzc0OWFkYWI2MGFjZTM5EgsSBxD148TngxkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMDk0Nzk5NDUyMTI3MDEzOTYyMg&filename=&opi=89354086',
  'mcp_focus.html': 'https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzAwMDY1NDRhYTdhNjE2YTIwOTI1ZDQ1MWYyMjEzZGJlEgsSBxD148TngxkYAZIBJAoKcHJvamVjdF9pZBIWQhQxMDk0Nzk5NDUyMTI3MDEzOTYyMg&filename=&opi=89354086'
};

for (const [file, url] of Object.entries(urls)) {
  https.get(url, (res) => {
    const fileStream = fs.createWriteStream(file);
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log(`Downloaded ${file}`);
    });
  }).on('error', (err) => {
    console.error(`Error downloading ${file}:`, err);
  });
}
