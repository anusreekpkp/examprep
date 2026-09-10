/**
 * Lets `req.user` be read anywhere downstream of the authenticate middleware
 * without casting at every call site.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
