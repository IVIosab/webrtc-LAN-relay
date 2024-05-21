# Step 1: Set the base image to Node.js version 20
FROM node:20-slim

# Step 2: Set the working directory in the container
WORKDIR /app

# Step 3: Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of your application code
COPY . .

# Step 6: Expose the port the app runs on
EXPOSE 8080

# Step 7: Define the command to run your app (as specified in package.json)
CMD ["npm", "start"]
