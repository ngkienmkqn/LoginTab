/**
 * TEST: Check what fingerprint data is being injected
 */

const FingerprintGenerator = require('./src/utils/FingerprintGenerator');
const PuppeteerEvasion = require('./src/utils/PuppeteerEvasion');

// Generate a sample fingerprint (using a test ID)
const testId = 'test-account-123';
const fingerprint = FingerprintGenerator.generateFingerprint(testId, 'win');

console.log('=== GENERATED FINGERPRINT ===');
console.log(JSON.stringify(fingerprint, null, 2));

console.log('\n=== EVASION SCRIPT (First 500 chars) ===');
const script = PuppeteerEvasion.getAllEvasionScripts(fingerprint);
console.log(script.substring(0, 500));
console.log('\n... (total length:', script.length, 'chars)');

// Check for problematic patterns
console.log('\n=== CHECKS ===');
console.log('✓ Contains WebGL override:', script.includes('WebGLRenderingContext'));
console.log('✓ Contains Navigator override:', script.includes('navigator.webdriver'));
console.log('✓ Contains Screen override:', script.includes('window.screen'));
console.log('✓ Contains Battery override:', script.includes('getBattery'));
console.log('⚠ Contains Canvas override:', script.includes('toDataURL') && script.includes('canvas'));
console.log('⚠ Contains Audio override:', script.includes('AudioContext') && script.includes('analyser'));
