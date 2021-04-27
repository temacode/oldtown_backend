module.exports = app => {
    app.get(`/api/galery`, (req, res) => {
        const images = [
            {
                path: 'gal-1.jpeg',
                size: 'width',
            },
            {
                path: 'gal-2.jpeg',
                size: 'width',
            },
            {
                path: '11.jpeg',
                size: 'width',
            },
            {
                path: '12.jpeg',
                size: 'width',
            },
            {
                path: '3.jpeg',
                size: 'width',
            },
            {
                path: '14.jpeg',
                size: 'width',
            },
            {
                path: '15.jpeg',
                size: 'width',
            },
            {
                path: '6.jpeg',
                size: 'height',
            },
            {
                path: '7.jpeg',
                size: 'height',
            },
        ];
        res.status(200).send(images);
    });

    app.get(`/api/product`, (req, res) => {
        const extras = require('../data/extraData');
        const productsList = require('../data/productsData');
        const products = productsList.map(product => {
            if (typeof product.extras !== 'undefined') {
                //Если у продукта есть поле extras, то оно наполняется из extras
                product.extras = extras.filter(extra => product.extras.indexOf(extra.id) !== -1);
            }

            return product;
        });
        res.set('Cache-control', `no-store`);
        res.status(200).send({products: [...products]});
    });
}