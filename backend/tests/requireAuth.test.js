const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.SECRET = 'test-secret-only-for-unit-tests';
const { generateToken, verifyToken } = require('../middlewares/requireAuth');

// Minimal Express-style response double that records what the middleware sends.
function mockResponse() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

test('generateToken embeds the user id and role and expires in 3 days', () => {
    const token = generateToken({ _id: 'u1', username: 'anoop', email: 'a@example.com', roleId: 7, status: 'Active' });
    const decoded = jwt.verify(token, process.env.SECRET);
    assert.equal(decoded.id, 'u1');
    assert.equal(decoded.roleId, 7);
    assert.equal(decoded.exp - decoded.iat, 3 * 24 * 60 * 60);
});

test('verifyToken rejects a request without an Authorization header', () => {
    const res = mockResponse();
    let calledNext = false;
    verifyToken({ headers: {} }, res, () => { calledNext = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(calledNext, false);
});

test('verifyToken rejects a header that is not a Bearer token', () => {
    const res = mockResponse();
    verifyToken({ headers: { authorization: 'Basic abc' } }, res, () => {});
    assert.equal(res.statusCode, 401);
});

test('verifyToken rejects a token signed with another secret', async () => {
    const forged = jwt.sign({ id: 'u1' }, 'some-other-secret');
    const res = mockResponse();
    let calledNext = false;
    verifyToken({ headers: { authorization: `Bearer ${forged}` } }, res, () => { calledNext = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'Invalid Token' });
    assert.equal(calledNext, false);
});
