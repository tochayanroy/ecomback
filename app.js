const express = require("express");
const app = express();
const dotenv = require('dotenv');
const db = require('./config/database');
require('./middleware/Passport-jwt');
const path = require("path");



const UserRoutes = require('./routes/UserRoutes');
const ProductRoutes = require('./routes/ProductRoutes');
const CategoryRoutes = require('./routes/CategoryRoutes');
const ReviewRoutes = require('./routes/ReviewRoutes');
const WishlistRoutes = require('./routes/WishlistRoutes');
const CartRoutes = require('./routes/CartRoutes');
const OrderRoutes = require('./routes/OrderRoutes');
const PaymentRoutes = require('./routes/PaymentRoutes');
const NotificationRoutes = require('./routes/NotificationRoutes');


dotenv.config();
app.use(express.json());
app.use("/User", UserRoutes);
app.use("/Product", ProductRoutes);
app.use("/Category", CategoryRoutes);
app.use("/Review", ReviewRoutes);
app.use("/Wishlist", WishlistRoutes);
app.use("/Cart", CartRoutes);
app.use("/Order", OrderRoutes);
app.use("/Payment", PaymentRoutes);
app.use("/Notification", NotificationRoutes);



app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

app.listen(process.env.PORT, () => {
    console.log("Server is running on port 5000");
});
