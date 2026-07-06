"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes/routes"));
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Default json limit is 100kb, far too small for large belief sets
// (tens of thousands of rules).
app.use(express_1.default.json({ limit: "10mb" }));
app.use("/", routes_1.default);
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
