import nextJest from 'next/jest.js';
export default nextJest({dir:'./'})({testEnvironment:'node',testPathIgnorePatterns:['/node_modules/','/e2e/']});
