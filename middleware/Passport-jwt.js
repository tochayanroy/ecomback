const User = require("../modules/UserSchema");
const passport = require("passport");

const { ExtractJwt, Strategy: JwtStrategy } = require("passport-jwt");

var opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
};

passport.use(new JwtStrategy(opts, async (jwt_payload, done) => {

    try {
        const user = await User.findOne({ _id: jwt_payload.id }).select("-password");
        if (user) {
            return done(null, user);
        } else {
            return done(null, false);
        }

    } catch (error) {
        return done(error, false);
    }
}));