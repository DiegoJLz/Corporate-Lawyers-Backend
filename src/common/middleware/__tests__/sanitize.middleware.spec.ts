import { SanitizeMiddleware } from '../sanitize.middleware';
import { Request, Response, NextFunction } from 'express';

describe('SanitizeMiddleware', () => {
  let middleware: SanitizeMiddleware;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    middleware = new SanitizeMiddleware();
    mockReq = { body: {} };
    mockRes = {};
    mockNext = jest.fn();
  });

  it('should strip script tags from string body fields', () => {
    mockReq.body = {
      name: 'John',
      bio: '<script>alert("xss")</script>Hello',
    };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.body.name).toBe('John');
    expect(mockReq.body.bio).toBe('Hello');
    expect(mockReq.body.bio).not.toContain('<script>');
  });

  it('should strip HTML tags from nested objects', () => {
    mockReq.body = {
      user: {
        firstName: '<b>Bold</b> Name',
        address: {
          street: '<img src=x onerror=alert(1)>Main St',
        },
      },
    };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.body.user.firstName).toBe('Bold Name');
    expect(mockReq.body.user.address.street).not.toContain('<img');
    expect(mockReq.body.user.address.street).toContain('Main St');
  });

  it('should strip XSS from array items', () => {
    mockReq.body = {
      tags: [
        'safe',
        '<script>alert("xss")</script>injected',
        '<img src=x onerror=alert(1)>image',
      ],
    };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.body.tags[0]).toBe('safe');
    expect(mockReq.body.tags[1]).toBe('injected');
    expect(mockReq.body.tags[2]).not.toContain('<img');
  });

  it('should not modify numbers, booleans, or null values', () => {
    mockReq.body = {
      count: 42,
      active: true,
      deleted: false,
      notes: null,
    };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.body.count).toBe(42);
    expect(mockReq.body.active).toBe(true);
    expect(mockReq.body.deleted).toBe(false);
    expect(mockReq.body.notes).toBeNull();
  });

  it('should call next() after sanitization', () => {
    mockReq.body = { name: 'test' };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should call next() even when body is undefined', () => {
    mockReq.body = undefined;

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
