//https://3dsec.sberbank.ru/payment/rest/register.do
const axios = require('axios');
const qs = require('querystring');
const products = require('../data/productsData');
const extras = require('../data/extraData');
const nodemailer = require('nodemailer');
const fs = require('fs');
const handlebars = require('handlebars');
const autoIncrement = require('mongoose-auto-increment');

const sberConfig = {
    userName: 'oldtown-api',
    password: 'oldtown',
    url: 'https://3dsec.sberbank.ru',
    returnUrl: 'http://localhost:3000',
}

const mailOpts = {
    user: 'noreply@tort-rzn.ru',
    replyUser: 'info@tort-rzn.ru',
    pass: 'Lin5g5Dt1V5tA0kTAxFYlYXwjPLw9IA',
    service: 'mail.ru',
    host: 'smtp.mail.ru',
    port: 465,
    secure: true,
    emailTemplatePath: '/../email/email.html',
}

if (process.env.NODE_ENV === 'test') {
    sberConfig.returnUrl = 'https://test.tort-rzn.ru';
}

if (process.env.NODE_ENV === 'production') {
    sberConfig.userName = 'P6234117862-api';
    sberConfig.password = 'saqtiz-sifkoc-0Dapky';
    sberConfig.url = 'https://securepayments.sberbank.ru';
    sberConfig.returnUrl = 'https://tort-rzn.ru';
}
console.log(`Данные окружения: \n`);
console.log(sberConfig);

const readHTMLFile = path => {
    return new Promise((resolve, reject) => {
        fs.readFile(__dirname + path, { encoding: 'utf-8' }, function (err, html) {
            if (err) {
                console.log(err);
                reject('Ошибка чтения файла');
            }
            else {
                resolve(html);
            }
        });
    });
};

const transporter = nodemailer.createTransport({
    service: mailOpts.service,
    host: mailOpts.host,
    port: mailOpts.host,
    secure: mailOpts.secure,
    auth: {
        user: mailOpts.user,
        pass: mailOpts.pass,
    }
})
module.exports = (app, mongoose) => {
    const Schema = mongoose.Schema;
    autoIncrement.initialize(mongoose.connection);

    const userSchema = new Schema({
        firstName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        tel: {
            type: String,
            required: true,
        },
        date: {
            type: Date,
            default: Date.now
        },
        orders: {
            type: Number,
            default: 0,
        }
    });
    const User = mongoose.model('user', userSchema);

    const orderSchema = new Schema({
        type: {
            type: String,
            required: true,
            default: 'cake',
        },
        status: {
            type: Number,
            required: true,
            default: 0,
        },
        basket: {},
        amount: {
            type: Number,
            required: true,
        },
        paid: {
            type: Number,
            required: true,
            default: 0,
        },
        orderId: {
            type: String,
        },
        user: {
            type: String,
            required: true,
        }
    });

    orderSchema.plugin(autoIncrement.plugin, 'Order');

    /*
    orderStatus
0 - заказ зарегистрирован, но не оплачен;
1 - предавторизованная сумма удержана (для двухстадийных платежей);
2 - проведена полная авторизация суммы заказа;
3 - авторизация отменена;
4 - по транзакции была проведена операция возврата;
5 - инициирована авторизация через сервер контроля доступа банка-эмитента;
6 - авторизация отклонена.
    */
    const Order = mongoose.model('order', orderSchema);

    const sendError = (res, errorString, errorBody) => {
        console.log('Ошибка:', errorString);
        console.log('Тело ошибки:', errorBody);
        res.status(500).send({ error: errorString });
    }

    const findUser = (userData) => {
        return new Promise((resolve, reject) => {
            User.findOne({ 'email': userData.email }).exec((err, user) => {
                if (err) {
                    reject('Ошибка запроса к базе данных');
                }

                if (!user) {
                    const user = new User({
                        firstName: userData.firstName,
                        email: userData.email,
                        tel: userData.tel,
                    });

                    saveUser(user).then(user => {
                        resolve(user);
                    }).catch(err => {
                        reject(err);
                    });
                }

                if (user) {
                    resolve(user);
                }
            });
        });
    }

    const findUserById = (userId) => {
        return new Promise((resolve, reject) => {
            User.findOne({ _id: userId }).exec((err, user) => {
                if (err) {
                    reject('Ошибка запроса к базе данных');
                }

                if (!user) {
                    reject('Пользователь не найден');
                }

                if (user) {
                    resolve(user);
                }
            });
        });
    }
    const saveUser = (user) => {
        return new Promise((resolve, reject) => {
            user.save(err => {
                if (err) {
                    reject('Ошибка сохранения пользователя в базе данных');
                }

                resolve(user);
            });
        })
    }

    const saveOrder = order => new Promise((resolve, reject) => {
        order.save(err => {
            if (err) {
                reject('Ошибка сохранения заказа в базе данных');
            }

            resolve(order);
        });
    });

    const findOrder = orderId => new Promise((resolve, reject) => {
        Order.findOne({ 'orderId': orderId }, (err, order) => {
            if (err) {
                reject('Не удалось выполнить запрос к базе данных');
            }

            if (!order) {
                reject('Не удалось найти заказ в базе данных');
            }

            if (order) {
                resolve(order);
            }
        });
    });


    app.get(`/api/payment/:orderId`, (req, res) => {
        const orderId = req.params.orderId;
        if (orderId === 'null') {
            sendError(res, 'Отсутствует номер заказа');
            return;
        }

        const query = {
            userName: sberConfig.userName,
            password: sberConfig.password,
            orderId: orderId,
        }

        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        }

        axios.post(
            `${sberConfig.url}/payment/rest/getOrderStatusExtended.do`,
            qs.stringify(query),
            config,
        )
            .then(response => {
                if (response.data.errorCode && response.data.errorCode !== '0') {
                    //Ошибка в запросе к банку, отправить сообщение на клиент
                    sendError(res, response.data.errorMessage);
                    return;
                }

                findOrder(orderId)
                    .then(order => {
                        order.status = Number(response.data.orderStatus);
                        order.paid = response.data.amount / 100;
                        saveOrder(order)
                            .then(order => {
                                findUserById(order.user)
                                    .then(user => {
                                        if (order.status === 2) {
                                            readHTMLFile(mailOpts.emailTemplatePath)
                                                .then(html => {
                                                    const template = handlebars.compile(html);
                                                    const replacements = {
                                                        orderId: order._id,
                                                        emailText: `Добрый день, ${user.firstName}. Спасибо, что сделали заказ! Наш кондитер свяжется с Вами в ближайшее время для обсуждения деталей заказа. Вся информация по заказу представлена ниже`,
                                                        name: user.firstName,
                                                        productName: order.basket.product.name,
                                                        weight: order.basket.weight,
                                                        extras: order.basket.selectedExtras.map(e => e.name).join(','),
                                                        tel: user.tel,
                                                        email: user.email,
                                                    };
                                                    let htmlToSend = template(replacements);
                                                    const mailOptions = {
                                                        from: mailOpts.user,
                                                        to: user.email,
                                                        subject: 'Заказ',
                                                        html: htmlToSend,
                                                    };

                                                    transporter.sendMail(mailOptions, (error, response) => {
                                                        if (error) {
                                                            //Здесь нужно вернуть обработки ошибки, я закомментил для дебага
                                                            //sendError(res, 'Ошибка отправки письма', error);
                                                            console.log('Ошибка отправки письма');
                                                            //return;
                                                        }
                                                        console.log('Вывод после отправки письма:', response);
                                                    });
                                                    console.log(order);
                                                    replacements.orderId = order._id;
                                                    replacements.user = user.firstName;
                                                    replacements.emailText = `Вся информация по заказу представлена ниже`;

                                                    htmlToSend = template(replacements);

                                                    mailOptions.to = mailOpts.replyUser;
                                                    mailOptions.html = htmlToSend;

                                                    transporter.sendMail(mailOptions, (error, response) => {
                                                        if (error) {
                                                            //Здесь нужно вернуть обработки ошибки, я закомментил для дебага
                                                            //sendError(res, 'Ошибка отправки письма', error);
                                                            console.log('Ошибка отправки письма');
                                                            //return;
                                                        }
                                                        console.log('Вывод после отправки письма:', response);
                                                    });
                                                })
                                                .catch(err => {
                                                    //Эта ошибка не должна пойти во фронт, нужно сделать отдельное уведомление о таких ошибках
                                                    console.log(err);
                                                    console.log('Ошибка чтения файла');
                                                });
                                        }
                                        res.status(200).send({
                                            status: order.status,
                                            basket: order.basket,
                                            orderNumber: order._id,
                                        });
                                    })
                                    .catch(err => {
                                        sendError(err);
                                    })
                            })
                            .catch(err => {
                                sendError(res, err);
                            })
                    })
                    .catch(err => {
                        sendError(res, err);
                    })
            }).catch(err => {
                sendError(res, err);
            });
    });

    app.post(`/api/payment`, (req, res) => {
        const user = {
            firstName: req.body.firstName,
            email: req.body.email,
            tel: req.body.tel,
        }

        const basket = req.body.basket;

        //Подменяем данные от пользователя на наши данные по айдишникам
        basket.product = products.find(product => product.id === basket.product.id);
        basket.selectedExtras = basket.selectedExtras.map(extra => {
            return extras.find(elem => elem.id === extra.id);
        });

        //Формирование цены
        const cakePrice = basket.product.price * basket.weight;
        const extrasPrice = basket.selectedExtras.reduce((acc, cur) => {
            return acc + cur.price;
        }, 0);

        const amount = cakePrice + extrasPrice;

        //должна быть Проверка на введеность всех полей и на корректность данных

        findUser(user)
            .then(user => {
                const order = new Order({
                    user: user._id,
                    basket: basket,
                    type: basket.product.type,
                    amount: amount,
                });

                saveOrder(order)
                    .then(order => {
                        console.log(order._id.toString());
                        const query = {
                            userName: sberConfig.userName,
                            password: sberConfig.password,
                            orderNumber: order._id.toString(),
                            returnUrl: `${sberConfig.returnUrl}/payment`,
                            failUrl: `${sberConfig.returnUrl}/payment`,
                            amount: Math.floor(amount * 100 / 2),
                            email: user.email,
                        };

                        const config = {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            }
                        }

                        axios.post(`${sberConfig.url}/payment/rest/register.do`, qs.stringify(query), config)
                            .then(response => {
                                console.log(response.data);
                                if (response.data.errorCode && response.data.errorCode !== '0') {
                                    sendError(res, response.data.errorMessage);
                                    return;
                                }

                                order.orderId = response.data.orderId;

                                saveOrder(order)
                                    .then(order => {
                                        res.status(200).send({ formUrl: response.data.formUrl });
                                    })
                                    .catch(err => {
                                        sendError(res, err);
                                    });
                            })
                            .catch(err => {
                                sendError(res, err);
                            });
                    })
                    .catch(err => {
                        sendError(res, err);
                    });
            })
            .catch(err => {
                sendError(res, err);
            });
    });
}