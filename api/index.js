const app = require('../server');

module.exports = async (req, res) => {
  const readyApp = await app.appReady;
  return readyApp(req, res);
};