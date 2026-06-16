import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Enabling Realtime for multiplayer tables...');
    
    // Add tables to the supabase_realtime publication
    await prisma.$executeRawUnsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE multiplayer_games;`);
    await prisma.$executeRawUnsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE multiplayer_players;`);
    await prisma.$executeRawUnsafe(`ALTER PUBLICATION supabase_realtime ADD TABLE multiplayer_guesses;`);
    
    console.log('Realtime enabled successfully!');
  } catch (error) {
    console.error('Error enabling realtime (tables might already be added):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
