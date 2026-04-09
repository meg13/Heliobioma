import asyncio
import json
import websockets

PORT = 8765
clients = set()


async def broadcast(sender, payload):
    if not clients:
        return
    dead = []
    message = json.dumps(payload)
    for client in list(clients):
        if client == sender:
            continue
        try:
            await client.send(message)
        except Exception:
            dead.append(client)
    for client in dead:
        clients.discard(client)


async def handler(websocket):
    clients.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except Exception:
                data = {"type": "raw", "payload": message}
            await broadcast(websocket, data)
    finally:
        clients.discard(websocket)


async def main():
    print(f"Sync server running on ws://localhost:{PORT}")
    async with websockets.serve(handler, "0.0.0.0", PORT, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


asyncio.run(main())
