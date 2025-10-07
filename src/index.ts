import { scanOnce } from './run/scan';

async function main() {
  const cmd = process.argv[2] || 'scan';
  if (cmd === 'scan') {
    const res = await scanOnce();
    console.log(`Scanned. New items: ${res.newItems.length}, total listed: ${res.total}`);
  } else {
    console.error('Unknown command');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
