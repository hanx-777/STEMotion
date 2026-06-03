import { NextResponse } from 'next/server';
import {
  activateModelProfileV1,
  deleteModelProfileV1,
  getModelProfilesV1,
  saveModelProfileV1,
} from '@/features/settings/application/modelProfileService';

export async function GET() {
  return NextResponse.json(await getModelProfilesV1());
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await saveModelProfileV1(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { activeProfile } = body;

    if (!activeProfile || typeof activeProfile !== 'string') {
      return NextResponse.json({ error: 'activeProfile is required' }, { status: 400 });
    }

    return NextResponse.json(await activateModelProfileV1(activeProfile));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    return NextResponse.json(await deleteModelProfileV1(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
