/**
 * Unit tests for src/utils/apiResponse.js
 */
const { success, created, paginated, error } = require('../../src/utils/apiResponse');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('apiResponse helpers', () => {
  describe('success()', () => {
    it('responds with 200 and success=true by default', () => {
      const res = mockRes();
      success(res, { id: 1 }, 'OK');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'OK',
        data: { id: 1 },
      });
    });

    it('accepts a custom status code', () => {
      const res = mockRes();
      success(res, {}, 'Accepted', 202);
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('created()', () => {
    it('responds with 201', () => {
      const res = mockRes();
      created(res, { id: 'abc' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { id: 'abc' } })
      );
    });
  });

  describe('paginated()', () => {
    it('responds with pagination metadata', () => {
      const res = mockRes();
      paginated(res, { data: [1, 2, 3], total: 30, page: 2, limit: 10 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 3,
        total: 30,
        page: 2,
        pages: 3,
        limit: 10,
        data: [1, 2, 3],
      });
    });

    it('calculates pages correctly for partial last page', () => {
      const res = mockRes();
      paginated(res, { data: [1], total: 11, page: 2, limit: 10 });
      const call = res.json.mock.calls[0][0];
      expect(call.pages).toBe(2);
    });

    it('returns pages=1 when total is 0', () => {
      const res = mockRes();
      paginated(res, { data: [], total: 0, page: 1, limit: 25 });
      const call = res.json.mock.calls[0][0];
      expect(call.pages).toBe(1);
    });
  });

  describe('error()', () => {
    it('responds with 500 and success=false by default', () => {
      const res = mockRes();
      error(res, 'Something went wrong');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      });
    });

    it('accepts custom statusCode and error code', () => {
      const res = mockRes();
      error(res, 'Not found', 404, 'NOT_FOUND');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'NOT_FOUND', success: false })
      );
    });
  });
});
