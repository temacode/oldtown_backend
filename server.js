const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 5000;
const colors = require("./helpers/term-colors");

const mongooseConfig = {
    connectString: 'mongodb://localhost:27017/oldtown',
}

if (process.env.NODE_ENV === 'production') {
    mongooseConfig.connectString = 'mongodb://localhost:27017/oldtown-production';
}

const mongoose = require('mongoose');
mongoose.set('useCreateIndex', true);
mongoose.connect(mongooseConfig.connectString, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => {
    console.log(`\n\nПодключение к базе данных по адресу ${colors.cyan}${mongooseConfig.connectString}${colors.reset} установлено!\n`);

    app.use(bodyParser.json());

    require('./routes/productsRoute')(app);
    require('./routes/paymentRoute')(app, mongoose);

    app.use(express.static('public'));

    if (process.env.NODE_ENV === 'production') {
        const path = require('path');
        app.get('*', (req, res) => {
            res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
        });
    }

    app.listen(port, () => {
        console.log(`\nСервер успешно запущен по адресу ${colors.cyan}http://localhost:${port}\n${colors.reset}`);
    });
})
.catch(error => {
    console.error('\x1b[36m%s\x1b[0m', '\n\nНе удалось установить соединение с базой данных\n\n', error);
});