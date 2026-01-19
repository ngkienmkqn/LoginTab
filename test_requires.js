try {
    console.log('Testing requires...');
    require('puppeteer-core');
    console.log('✅ puppeteer-core OK');

    try {
        require('proxy-chain');
        console.log('✅ proxy-chain OK');
    } catch (e) { console.error('❌ proxy-chain invalid:', e.message); }

    try {
        require('otplib');
        console.log('✅ otplib OK');
    } catch (e) { console.error('❌ otplib invalid:', e.message); }

    try {
        require('fs-extra');
        console.log('✅ fs-extra OK');
    } catch (e) { console.error('❌ fs-extra invalid:', e.message); }

    console.log('🎉 Done.');
} catch (error) {
    console.error('CRITICAL ERROR:', error);
}
