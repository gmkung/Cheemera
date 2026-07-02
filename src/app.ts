import express from "express";
import routes from "./routes/routes";

const app = express();
const port = process.env.PORT || 3001;

// Default json limit is 100kb, far too small for large belief sets
// (tens of thousands of rules).
app.use(express.json({ limit: "10mb" }));

app.use("/", routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
