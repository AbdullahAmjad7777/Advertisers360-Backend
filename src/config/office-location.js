import dotenv from 'dotenv';

// Defensive dotenv.config() call, same as config/db.js: ES module imports
// are hoisted and evaluated before server.js's own top-level dotenv.config()
// call runs, so without this, process.env.OFFICE_* would still be undefined
// when these constants are computed.
dotenv.config();

export const OFFICE_LATITUDE = Number(process.env.OFFICE_LATITUDE);
export const OFFICE_LONGITUDE = Number(process.env.OFFICE_LONGITUDE);
export const OFFICE_RADIUS_METERS = Number(process.env.OFFICE_RADIUS_METERS) || 200;
