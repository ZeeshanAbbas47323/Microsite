-- Local development only: lets the app user create the Prisma shadow database and the test database.
GRANT ALL PRIVILEGES ON *.* TO 'microstore'@'%';
FLUSH PRIVILEGES;
