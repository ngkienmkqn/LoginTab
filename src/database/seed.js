const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');

const file = path.join(process.cwd(), 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter, { accounts: [], proxies: [], extensions: [], platforms: [] });

const platforms = [
    { name: "Gmail", url: "https://accounts.google.com/" },
    { name: "Tazapay (Cổng)", url: "https://dashboard.tazapay.com/login" },
    { name: "Stripe (Cổng)", url: "https://dashboard.stripe.com/login" },
    { name: "Payoneer (Ví & Cổng)", url: "https://login.payoneer.com/" },
    { name: "Pingpong (Thẻ+ví)", url: "https://us.pingpongx.com/entrance/signin" },
    { name: "Lianlian Global (Thẻ+ví)", url: "https://v2.lianlianglobal.com/login" },
    { name: "Epay (Ví)", url: "https://www.epay.com/login" },
    { name: "Xtransfer (Ví)", url: "https://login.xtransfer.cn/" },
    { name: "Worldfirst (Thẻ+ví)", url: "https://portal.worldfirst.com/" },
    { name: "Statrys (Ví)", url: "https://app.statrys.com/login" },
    { name: "Mercury (Ví)", url: "https://app.mercury.com/login" },
    { name: "Aspire (Thẻ+ví)", url: "https://app.aspireapp.com/login" },
    { name: "Vaiwallet (Ví)", url: "https://vaiwallet.com/login" },
    { name: "Wise (Ví)", url: "https://wise.com/login/" },
    { name: "Brex (Ví)", url: "https://dashboard.brex.com/sign-in" },
    { name: "Launchese (Ví & Cổng)", url: "https://launchese.com/login" },
    { name: "Standard Chartered (Ví)", url: "https://www.sc.com/global/av/generated/login/" },
    { name: "Paypal (Ví & Cổng)", url: "https://www.paypal.com/signin" },
    { name: "Binance (Crypto)", url: "https://accounts.binance.com/en/login" },
    { name: "Bybit (Crypto)", url: "https://www.bybit.com/login" },
    { name: "Huobi (Crypto)", url: "https://www.htx.com/en-us/login/" },
    { name: "RD Wallet (Ví)", url: "https://rdwallet.com/" },
    { name: "Tiền mặt", url: "" },
    { name: "Airwallex (Ví & Cổng)", url: "https://www.airwallex.com/login" },
    { name: "Auxpay (Ví & Cổng)", url: "https://auxpay.net/" },
    { name: "Revolut (Ví)", url: "https://app.revolut.com/login" },
    { name: "PayZ (Ví & Cổng)", url: "https://www.payz.com/" },
    { name: "Neteller (Ví)", url: "https://member.neteller.com/" },
    { name: "Skrill (Ví)", url: "https://account.skrill.com/" },
    { name: "Monese (Ví)", url: "https://monese.com/" },
    { name: "Paysera (Ví)", url: "https://bank.paysera.com/en/login" },
    { name: "OFX Money Transfer (Ví)", url: "https://www.ofx.com/login/" },
    { name: "Paysend (Ví)", url: "https://paysend.com/auth" },
    { name: "Global66 (Ví)", url: "https://app.global66.com/login" },
    { name: "WorldRemit (Ví)", url: "https://www.worldremit.com/en/login" },
    { name: "KOHO (Ví)", url: "https://web.koho.ca/login" },
    { name: "Yuh (Ví)", url: "https://www.yuh.com/" },
    { name: "Gopay (Ví)", url: "https://gopay.co.id/" },
    { name: "COSMO payment (Ví)", url: "https://www.cosmopayment.com/login" },
    { name: "MoneyGram (Ví)", url: "https://www.moneygram.com/mgo/us/en/login/" },
    { name: "Octopus (Ví)", url: "https://www.octopus.com.hk/en/consumer/" },
    { name: "Conotoxia (Ví)", url: "https://cinkciarz.pl/en/login" },
    { name: "Payday (Ví)", url: "https://payday.com/" },
    { name: "Sadapay (Ví)", url: "https://sadapay.pk/" },
    { name: "Interac e-transfer (Ví)", url: "https://www.interac.ca/" },
    { name: "RBC Wallet (Ví)", url: "https://www.rbcroyalbank.com/onlinebanking/" },
    { name: "Scotiabank (Ví)", url: "https://www.scotiabank.com/" },
    { name: "TC US Dollar (Ví)", url: "" },
    { name: "CIBC (Ví)", url: "https://www.cibc.com/" },
    { name: "SOLDO (Ví)", url: "https://manage.soldo.com/" },
    { name: "Silkpay (Ví & Cổng)", url: "https://www.silkpay.eu/" },
    { name: "Alipayplus (Ví)", url: "https://www.alipayplus.com/" },
    { name: "Currenxie (Ví)", url: "https://currenxie.com/" },
    { name: "Ria (Ví)", url: "https://www.riamoneytransfer.com/" },
    { name: "OFX (Crypto)", url: "https://www.ofx.com/" },
    { name: "GEO Swift (Ví)", url: "https://www.geoswift.com/" },
    { name: "terrapay (Ví)", url: "https://www.terrapay.com/" },
    { name: "finfan (Ví)", url: "https://finfan.vn/" },
    { name: "FasterPay (Ví)", url: "https://www.fasterpay.com/login" },
    { name: "Sunrate (Thẻ+ví)", url: "https://www.sunrate.com/" },
    { name: "CASH APP (Ví)", url: "https://cash.app/login" },
    { name: "Pomelo (Ví)", url: "https://pomelo.la/" },
    { name: "J-Pay (Ví)", url: "https://www.jpay.com/" },
    { name: "Trust Wallet (Crypto)", url: "https://trustwallet.com/" },
    { name: "Payful (Ví+Cổng+Thẻ)", url: "" },
    { name: "UQPAY (Ví+Cổng+Thẻ)", url: "https://www.uqpay.com/" },
    { name: "SKYPAY (Ví+Cổng+Thẻ)", url: "" },
    { name: "PEXX (Ví+Cổng+Thẻ)", url: "https://pexx.com/" },
    { name: "Flagright (Ví+Cổng+Thẻ)", url: "https://flagright.com/" },
    { name: "Monetapay (Ví+Cổng+Thẻ)", url: "https://monetapay.com/" },
    { name: "DeCard (Thẻ+ví)", url: "https://decard.io/" },
    { name: "Paymentology (Ví & Cổng)", url: "https://www.paymentology.com/" },
    { name: "Digit9 (Ví & Cổng)", url: "" },
    { name: "Coocon (Ví & Cổng)", url: "https://coocon.net/" }
];

async function seed() {
    await db.read();
    db.data.platforms = []; // Clear existing platforms

    // We are NOT clearing accounts anymore.
    // db.data.accounts = []; 

    console.log(`Seeding ${platforms.length} platforms into 'platforms' collection...`);

    for (const p of platforms) {
        db.data.platforms.push({
            id: uuidv4(),
            name: p.name,
            url: p.url,
        });
    }

    await db.write();
    console.log('Seed Complete!');
}

seed();
