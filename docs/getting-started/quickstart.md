# Quickstart

This quickstart runs Z0Auth locally with PostgreSQL, completes the first-instance setup, and leaves you signed in to the administration console.

It is intended for local evaluation and development. It is not a production deployment guide.

## Prerequisites

You need:

- Git;
- Docker with Docker Compose.

The commands below assume a POSIX-compatible shell.

## Start Z0Auth

Clone the repository and enter it:

```sh
git clone https://github.com/falcon-Z/z0-auth.git
cd z0-auth
```

Set a local database password for the Compose stack:

```sh
export Z0_AUTH_DB_AUTH='local-development-password'
```

Start Z0Auth and PostgreSQL:

```sh
docker compose up --build -d --wait
```

The container startup applies database migrations automatically. Z0Auth is available at:

```text
http://localhost:3000
```

## Verify the instance

Check the readiness endpoint:

```sh
curl --fail http://localhost:3000/api/ready
```

A successful response means the application and its required database state are ready.

## Create the first account

Open:

```text
http://localhost:3000/auth/setup
```

Enter an organization name and the details for the first account, then complete setup.

Z0Auth redirects you to sign in. Use the account you just created. After authentication, you can access the administration console at:

```text
http://localhost:3000
```

You now have a running local Z0Auth instance with its first operator account.

## Stop the instance

To stop the containers while keeping the database and instance keys:

```sh
docker compose down
```

To remove the local database and generated instance-key volume as well:

```sh
docker compose down --volumes
```

Removing the volumes destroys the local instance state.

## Next steps

Continue with the first-application guide when you are ready to register an application and connect it to Z0Auth.

For deployment and production operation, use the Operations documentation rather than this local quickstart.
