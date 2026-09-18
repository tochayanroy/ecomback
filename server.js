const express = require("express");
const app = express();
const dotenv = require("dotenv")
require("./config/database")
require("./middleware/passport-jwt")
const path = require("path")


const UserRoutes = require("./routes/UserRoutes");
const ProductRoutes = require("./routes/ProductRoutes");


dotenv.config()
app.use(express.json())


app.use('/user', UserRoutes)
app.use('/product', ProductRoutes)


app.use("/uploads", express.static(path.join(__dirname, "uploads")))


app.listen(process.env.PORT, ()=>{
    console.log("Server is running on port 5000");
})