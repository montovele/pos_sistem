import assert from 'node:assert/strict';

const main = async () => {
  const previousToken = process.env.HARDWARE_AGENT_TOKEN;
  const previousWeight = process.env.HARDWARE_SCALE_WEIGHT_GRAMS;
  process.env.HARDWARE_AGENT_TOKEN = 'offline-test-token';
  process.env.HARDWARE_SCALE_WEIGHT_GRAMS = '250';
  const { app } = await import('../server.js');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    'X-Agent-Token': 'offline-test-token',
    'Content-Type': 'application/json'
  };

  try {
    const scale = await fetch(`${base}/scale/weight`, { headers });
    assert.equal(scale.status, 200);
    assert.equal((await scale.json()).stable, true);

    const print = await fetch(`${base}/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        saleId: 'LOCAL-OFFLINE-1',
        type: 'SALE_OFFLINE',
        openDrawer: true,
        ticket: { folio: 'TICKET-LOCAL-OFFLINE-1', items: [], total: 100 }
      })
    });
    assert.equal(print.status, 200);
    const printBody = await print.json();
    assert.equal(printBody.print.ok, true);
    assert.equal(printBody.drawer.ok, true);
  } finally {
    server.close();
    if (previousToken === undefined) delete process.env.HARDWARE_AGENT_TOKEN;
    else process.env.HARDWARE_AGENT_TOKEN = previousToken;
    if (previousWeight === undefined) delete process.env.HARDWARE_SCALE_WEIGHT_GRAMS;
    else process.env.HARDWARE_SCALE_WEIGHT_GRAMS = previousWeight;
  }

  console.log('hardware offline contract test passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
