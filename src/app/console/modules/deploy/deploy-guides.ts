import type { DeployProviderId } from "@z0/contracts/deploy-status";

export type GuideLink = {
  label: string;
  href: string;
};

export type GuideStep = {
  title: string;
  body: string;
  code?: string;
  links?: GuideLink[];
};

export const DEPLOY_PROVIDERS: { id: DeployProviderId; label: string }[] = [
  { id: "docker", label: "Docker" },
  { id: "google-cloud-run", label: "Google Cloud Run" },
  { id: "railway", label: "Railway" },
  { id: "render", label: "Render" },
  { id: "aws-ec2", label: "AWS" },
  { id: "generic", label: "Other" },
];

/** Official PostgreSQL connection string format. */
export const POSTGRESQL_CONNSTRING_DOC =
  "https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING";

export const DATABASE_GUIDES: Record<DeployProviderId, GuideStep[]> = {
  docker: [
    {
      title: "Run PostgreSQL",
      body: "Start a Postgres container on your machine or network. The official image documents required environment variables and data persistence.",
      links: [
        { label: "PostgreSQL image (Docker Hub)", href: "https://hub.docker.com/_/postgres" },
        {
          label: "PostgreSQL with Docker (Docker Docs)",
          href: "https://docs.docker.com/guides/postgresql/",
        },
      ],
    },
    {
      title: "Build your connection string",
      body: "Use a standard PostgreSQL URL. Replace user, password, host, port, and database name with your values.",
      code: "postgresql://USER:PASSWORD@HOST:5432/DATABASE",
      links: [
        { label: "Connection string format (PostgreSQL)", href: POSTGRESQL_CONNSTRING_DOC },
      ],
    },
    {
      title: "Apply schema migrations",
      body: "Before first use, apply SQL migrations against this database. From the repo (or your release artifact) with DATABASE_URL set:",
      code: "bun run db:migrate",
    },
    {
      title: "Set DATABASE_URL on the app",
      body: "Pass DATABASE_URL when you run your z0-auth container, then restart the app and refresh this page.",
      links: [
        {
          label: "Set environment variables (Docker Docs)",
          href: "https://docs.docker.com/compose/environment-variables/set-environment-variables/",
        },
      ],
    },
  ],
  "google-cloud-run": [
    {
      title: "Create a Cloud SQL instance",
      body: "Create a Cloud SQL for PostgreSQL instance in the same region you plan to use for Cloud Run.",
      links: [
        {
          label: "Create a Cloud SQL instance",
          href: "https://cloud.google.com/sql/docs/postgres/create-instance",
        },
      ],
    },
    {
      title: "Connect Cloud Run to Cloud SQL",
      body: "Follow Google’s quickstart to attach the database to your Cloud Run service and obtain a connection string.",
      links: [
        {
          label: "Connect Cloud SQL from Cloud Run",
          href: "https://cloud.google.com/sql/docs/postgres/connect-instance-cloud-run",
        },
        {
          label: "Connect from Cloud Run (reference)",
          href: "https://cloud.google.com/sql/docs/postgres/connect-run",
        },
      ],
    },
    {
      title: "Set DATABASE_URL on the service",
      body: "Add DATABASE_URL in the Cloud Run service’s Variables & secrets tab (or via gcloud). Deploy a new revision after saving.",
      links: [
        {
          label: "Configure environment variables (Cloud Run)",
          href: "https://cloud.google.com/run/docs/configuring/services/environment-variables",
        },
      ],
    },
  ],
  railway: [
    {
      title: "Add PostgreSQL to your project",
      body: "Provision a PostgreSQL database in the same Railway project as your app.",
      links: [{ label: "PostgreSQL on Railway", href: "https://docs.railway.com/databases/postgresql" }],
    },
    {
      title: "Copy the connection URL",
      body: "Open your PostgreSQL service, find the connection variables, and copy DATABASE_URL (or the Postgres connection URL).",
      links: [{ label: "Railway databases overview", href: "https://docs.railway.com/databases" }],
    },
    {
      title: "Set DATABASE_URL on your app service",
      body: "Paste the value as DATABASE_URL on your z0-auth service, redeploy, restart if needed, then refresh this page.",
      links: [{ label: "Variables on Railway", href: "https://docs.railway.com/guides/variables" }],
    },
  ],
  render: [
    {
      title: "Create a Render Postgres database",
      body: "Create a PostgreSQL instance in the same region as your web service.",
      links: [{ label: "Render Postgres", href: "https://render.com/docs/postgresql" }],
    },
    {
      title: "Use the internal database URL",
      body: "For an app and database in the same region, use the internal connection string as DATABASE_URL on your web service.",
      links: [{ label: "Render Postgres documentation", href: "https://render.com/docs/postgresql" }],
    },
    {
      title: "Redeploy the web service",
      body: "Save environment variables and trigger a deploy so the new DATABASE_URL is picked up, then refresh this page.",
      links: [{ label: "Environment variables (Render)", href: "https://render.com/docs/environment-variables" }],
    },
  ],
  "aws-ec2": [
    {
      title: "Create an RDS PostgreSQL instance",
      body: "Create a DB instance and note the endpoint, port, database name, and master credentials.",
      links: [
        {
          label: "Creating a PostgreSQL DB instance (RDS)",
          href: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingPostgreSQL.html",
        },
      ],
    },
    {
      title: "Allow network access",
      body: "Configure the RDS security group so your EC2 instance (or container host) can reach port 5432.",
      links: [
        {
          label: "Connect to a PostgreSQL DB instance (RDS)",
          href: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ConnectToPostgreSQLInstance.html",
        },
      ],
    },
    {
      title: "Set DATABASE_URL on the app host",
      body: "Build a PostgreSQL URL from the RDS endpoint and set it as DATABASE_URL for z0-auth, then restart the app.",
      code: "postgresql://USER:PASSWORD@your-instance.region.rds.amazonaws.com:5432/DATABASE",
      links: [{ label: "Connection string format (PostgreSQL)", href: POSTGRESQL_CONNSTRING_DOC }],
    },
  ],
  generic: [
    {
      title: "Provision PostgreSQL",
      body: "Use any managed or self-hosted PostgreSQL 16+ reachable from where z0-auth runs.",
      links: [{ label: "PostgreSQL documentation", href: "https://www.postgresql.org/docs/" }],
    },
    {
      title: "Set DATABASE_URL",
      body: "Set DATABASE_URL in your platform’s environment or secret store, restart the application, then refresh this page.",
      code: "postgresql://USER:PASSWORD@HOST:5432/DATABASE",
      links: [{ label: "Connection string format (PostgreSQL)", href: POSTGRESQL_CONNSTRING_DOC }],
    },
  ],
};

export const SECRETS_GUIDES: Record<DeployProviderId, GuideStep[]> = {
  docker: [
    {
      title: "Generate keys once",
      body: "Run these commands on a trusted machine. Keep the output private.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
    },
    {
      title: "Pass them to the container",
      body: "Set INSTANCE_DATA_KEY, INSTANCE_TOKEN_PRIVATE_KEY, and INSTANCE_TOKEN_PUBLIC_KEY alongside DATABASE_URL when you run the container.",
      links: [
        {
          label: "Set environment variables (Docker Docs)",
          href: "https://docs.docker.com/compose/environment-variables/set-environment-variables/",
        },
      ],
    },
    {
      title: "Restart and refresh",
      body: "Restart the container so it loads the new variables, then click Refresh on this page.",
    },
  ],
  "google-cloud-run": [
    {
      title: "Generate keys once",
      body: "Run these commands locally. Store the output in Secret Manager, not in your container image.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
      links: [{ label: "Secret Manager documentation", href: "https://cloud.google.com/secret-manager/docs" }],
    },
    {
      title: "Expose secrets to Cloud Run",
      body: "Map each secret to an environment variable on your Cloud Run service, then deploy a new revision.",
      links: [
        {
          label: "Configure secrets on Cloud Run",
          href: "https://cloud.google.com/run/docs/configuring/secrets",
        },
      ],
    },
    {
      title: "Use the same values on every replica",
      body: "If you run multiple instances, every revision must use identical key material.",
    },
  ],
  railway: [
    {
      title: "Generate keys once",
      body: "Run these commands locally, then add each line as a variable on your z0-auth service.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
    },
    {
      title: "Add service variables",
      body: "Create variables for INSTANCE_DATA_KEY, INSTANCE_TOKEN_PRIVATE_KEY, and INSTANCE_TOKEN_PUBLIC_KEY, then redeploy.",
      links: [{ label: "Variables on Railway", href: "https://docs.railway.com/guides/variables" }],
    },
  ],
  render: [
    {
      title: "Generate keys once",
      body: "Run these commands locally, then add each value under Environment on your web service.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
    },
    {
      title: "Save and deploy",
      body: "After adding the three variables, save and deploy so the service restarts with the new secrets.",
      links: [{ label: "Environment variables (Render)", href: "https://render.com/docs/environment-variables" }],
    },
  ],
  "aws-ec2": [
    {
      title: "Generate keys once",
      body: "Run these commands locally. Store the values in AWS Secrets Manager or Parameter Store.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
      links: [
        {
          label: "AWS Secrets Manager",
          href: "https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html",
        },
      ],
    },
    {
      title: "Inject at runtime",
      body: "Load the secrets into the process environment before starting z0-auth (systemd, Docker env-file, or your orchestrator). Use the same values on every instance behind a load balancer.",
    },
  ],
  generic: [
    {
      title: "Generate keys once",
      body: "Run these commands on a trusted machine. Store the output in your platform’s secret manager.",
      code: `bun src/scripts/generate-instance-data-key.ts
bun src/scripts/generate-instance-token-keys.ts`,
    },
    {
      title: "Set three environment variables",
      body: "INSTANCE_DATA_KEY encrypts stored secrets such as your SMTP password. The token pair secures password-reset links. Restart the app after setting them.",
    },
    {
      title: "Keep keys stable",
      body: "Use the same values across restarts and replicas. Changing keys without re-saving settings can make existing encrypted data unreadable.",
    },
  ],
};

const BOOTSTRAP_ENV_CODE = `Z0_BOOTSTRAP_ORG_NAME="Acme IAM"
Z0_BOOTSTRAP_ADMIN_NAME="Owner User"
Z0_BOOTSTRAP_ADMIN_EMAIL="owner@example.com"
Z0_BOOTSTRAP_ADMIN_PASSWORD="use-a-strong-unique-password"`;

const BOOTSTRAP_SHARED_STEPS: GuideStep[] = [
  {
    title: "Set all first-owner variables",
    body: "Automatic first-owner setup runs only when all four values are present. If you leave them all unset, z0-auth uses the browser setup form instead.",
    code: BOOTSTRAP_ENV_CODE,
  },
  {
    title: "Restart the app",
    body: "The app reads bootstrap configuration during startup. After setup completes, these variables are ignored by z0-auth.",
  },
];

export const BOOTSTRAP_OWNER_GUIDES: Record<DeployProviderId, GuideStep[]> = {
  docker: [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Pass the variables to Docker",
      body: "Add the four values to your compose file, env-file, or container run command alongside DATABASE_URL and instance keys.",
      links: [
        {
          label: "Set environment variables (Docker Docs)",
          href: "https://docs.docker.com/compose/environment-variables/set-environment-variables/",
        },
      ],
    },
  ],
  "google-cloud-run": [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Store sensitive values as secrets",
      body: "Store the admin password in Secret Manager and map it to Z0_BOOTSTRAP_ADMIN_PASSWORD. The other values may be service variables or secrets, depending on your policy.",
      links: [
        {
          label: "Configure secrets on Cloud Run",
          href: "https://cloud.google.com/run/docs/configuring/secrets",
        },
        {
          label: "Configure environment variables (Cloud Run)",
          href: "https://cloud.google.com/run/docs/configuring/services/environment-variables",
        },
      ],
    },
  ],
  railway: [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Add service variables",
      body: "Add the four Z0_BOOTSTRAP variables on your z0-auth service, then redeploy so startup can create the first owner.",
      links: [{ label: "Variables on Railway", href: "https://docs.railway.com/guides/variables" }],
    },
  ],
  render: [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Add environment values",
      body: "Add the four Z0_BOOTSTRAP values under Environment on your web service, save, and deploy.",
      links: [{ label: "Environment variables (Render)", href: "https://render.com/docs/environment-variables" }],
    },
  ],
  "aws-ec2": [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Load values at process start",
      body: "Store the password in AWS Secrets Manager or Parameter Store, then expose all four variables to the z0-auth process through systemd, Docker, ECS, or your orchestrator.",
      links: [
        {
          label: "AWS Secrets Manager",
          href: "https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html",
        },
      ],
    },
  ],
  generic: [
    ...BOOTSTRAP_SHARED_STEPS,
    {
      title: "Use your host's secret store",
      body: "Put the password in your deployment secret manager and expose the other values as normal environment configuration. Restart after saving.",
    },
  ],
};
