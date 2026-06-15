// Jest setup for e2e suites. Runs once per test file before the suite.
//
// reflect-metadata MUST be imported before any Nest decorators are evaluated,
// exactly as src/main.ts does at runtime. Without it, dependency injection
// metadata (emitted via emitDecoratorMetadata) is not registered and
// Test.createTestingModule(...).compile() fails to resolve providers.
import 'reflect-metadata';

// The .env at apps/api/.env carries DATABASE_URL (127.0.0.1:3307), JWT_SECRET,
// etc. AppModule loads it via ConfigModule.forRoot({ isGlobal: true }), which
// reads process.cwd()/.env. Jest's rootDir is apps/api, so cwd already points
// there and the same .env the app uses is picked up — no extra wiring needed.
