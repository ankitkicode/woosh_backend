import swaggerAutogen from 'swagger-autogen';
import dotenv from 'dotenv';

dotenv.config();

const doc = {
  info: {
    title: 'Woosh API Documentation',
    description: 'API endpoints for Woosh - The Women-led Bike Taxi Platform.',
    version: '1.0.0',
  },
  host: `localhost:${process.env.PORT || 5001}`,
  basePath: '/api/v1',
  schemes: ['http', 'https'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Enter your Bearer token in the format **Bearer &lt;token&gt;**'
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

const outputFile = '../docs/swagger_output.json';
// Point it to where the routes are attached to the router/app
const endpointsFiles = ['./src/routes/index.ts'];

swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  console.log('Swagger documentation generated successfully!');
});
