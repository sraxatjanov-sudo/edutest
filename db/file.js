// Baza fayli joylashuvi (zaxiradan tiklash baza ochilishidan oldin ham bilishi kerak)
const path = require('node:path');
module.exports = process.env.DB_FILE || path.join(__dirname, '..', 'edutest.db');
