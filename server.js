const express = require('express');
const app = express();

app.use('/boh', require('./boh'));

app.get('/', (req, res) => res.redirect('/boh/display'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`  Display: http://localhost:${PORT}/boh/display`);
  console.log(`  Admin:   http://localhost:${PORT}/boh/admin`);
});
