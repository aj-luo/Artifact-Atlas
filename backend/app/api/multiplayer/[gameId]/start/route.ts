import { POST as roomPost } from '@/app/api/rooms/[roomId]/[action]/route';
export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  return roomPost(req, { params: Promise.resolve({ roomId: gameId, action: 'start' }) });
}
