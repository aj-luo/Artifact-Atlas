// One-time migration administration. Never accepts public IDs as client auth.
const { PrismaClient } = require('@prisma/client');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const [memberId, outputFile] = process.argv.slice(2);
if (!/^[a-f0-9-]{36}$/i.test(memberId ?? '') || !outputFile) {
  console.error('Usage: node --env-file=.env.local scripts/provision-legacy-room-member.cjs MEMBER_ID PRIVATE_OUTPUT_FILE');
  process.exit(1);
}
const db = new PrismaClient();
async function main() {
  const member = await db.multiplayer_room_members.findUnique({ where: { id: memberId } });
  if (!member || member.credential_hash !== null) throw new Error('Only an unprovisioned legacy member can be provisioned');
  const credential = randomBytes(32).toString('hex');
  // Exclusive file creation prevents overwriting an existing credential export.
  fs.writeFileSync(outputFile, JSON.stringify({ memberId, credential, name: member.name }), { flag: 'wx', mode: 0o600 });
  const result = await db.multiplayer_room_members.updateMany({ where: { id: memberId, credential_hash: null },
    data: { credential_hash: createHash('sha256').update(credential).digest('hex') } });
  if (result.count !== 1) throw new Error('Member was provisioned concurrently; this export is invalid');
  console.log('Credential provisioned. Privately deliver the export to the verified member.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
