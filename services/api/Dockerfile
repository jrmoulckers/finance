# Dockerfile for Finance API — Supabase Edge Functions runtime (#624)
#
# Builds a container image that runs the Edge Functions locally or in CI.
#
# Usage:
#   docker build -t finance-api .
#   docker run -p 9000:9000 \
#     -e SUPABASE_URL=http://host.docker.internal:54321 \
#     -e SUPABASE_SERVICE_ROLE_KEY=your-key \
#     -e ALLOWED_ORIGINS=http://localhost:3000 \
#     finance-api

FROM denoland/deno:2.3.1

WORKDIR /app

# Copy function source files
COPY supabase/functions/ /app/functions/

# Expose the Edge Functions port
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD deno eval "const r = await fetch('http://localhost:9000/health-check'); if (!r.ok) Deno.exit(1);" || exit 1

# Run the edge runtime
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "/app/functions/main/index.ts"]
