module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/servapps"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["servapps/**/*.{ts,js}", "!servapps/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
};
