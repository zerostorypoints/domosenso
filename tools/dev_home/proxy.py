"""Fixed-destination TCP UI relay; HTTP and WebSocket bytes pass unchanged.

The demo HA stays exclusively on an internal Docker network. Docker cannot publish
ports from that network, so this unprivileged sidecar exposes only its HA socket.
It accepts no destination URL or CONNECT command, and cannot route IP packets.
"""
import asyncio
import sys


async def serve(target):
    async def client(reader, writer):
        upstream_writer = None
        tasks = []
        try:
            upstream_reader, upstream_writer = await asyncio.wait_for(asyncio.open_connection(target, 8123), 5)

            async def copy(source, destination):
                while chunk := await source.read(65536):
                    destination.write(chunk)
                    await destination.drain()

            tasks = [asyncio.create_task(copy(reader, upstream_writer)), asyncio.create_task(copy(upstream_reader, writer))]
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, asyncio.TimeoutError):
            pass
        finally:
            for task in tasks:
                task.cancel()
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            writer.close()
            if upstream_writer:
                upstream_writer.close()

    server = await asyncio.start_server(client, '0.0.0.0', 8123)
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(serve(sys.argv[1]))
