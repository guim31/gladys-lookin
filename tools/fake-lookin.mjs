// -----------------------------------------------------------------------------
// A simulated LOOKin Remote2 on the network, for development and the container
// test: the HTTP API on PORT (80 by default) and the answer to the UDP
// "LOOK.in:Discover!" request on port 61201. Same behaviour as the fake of the
// tests (test/helpers/fakeLookin.js). Never shipped in the image.
//
//   node tools/fake-lookin.mjs            # PORT=8080 node tools/fake-lookin.mjs
// -----------------------------------------------------------------------------

import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { FakeLookin } from '../test/helpers/fakeLookin.js';

const lookin = new FakeLookin({ host: process.env.HOST_ADDRESS ?? '0.0.0.0' });
const port = Number(process.env.PORT ?? 80);

createServer((request, response) => {
  const { status, body } = lookin.handle(new URL(request.url, 'http://x').pathname);
  console.log(`${request.method} ${request.url} -> ${status}`);
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}).listen(port, () => console.log(`fake LOOKin ${lookin.id} on HTTP ${port}, UDP 61201`));

const udp = createSocket('udp4');
udp.on('message', (message, from) => {
  if (message.toString().startsWith('LOOK.in:Discover!')) {
    udp.send(`LOOK.in:Alive!${lookin.id}:1:2.38:0:${from.address}`, from.port, from.address);
  }
});
udp.bind(61201);
