import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Helper to generate JWT and send HTTP-only cookie
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const jwtSecret =
    process.env.JWT_SECRET || 'super_secret_jwt_key_for_development_12345!';

  const token = jwt.sign({ id: user._id }, jwtSecret, {
    expiresIn: '7d',
  });

  const isProduction = process.env.NODE_ENV === 'production';

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };

  res
    .status(statusCode)
    .cookie('token', token, cookieOptions)
    .json({
      success: true,
      message,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        address: user.address || '',
        createdAt: user.createdAt,
      },
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  try {
    const { name, email, password, address } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Create user (password is hashed in pre-save hook)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      address: address ? address.trim() : '',
    });

    sendTokenResponse(user, 201, res, 'Account created successfully!');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration.',
    });
  }
};

// @desc    Authenticate user & get token cookie
// @route   POST /api/auth/login
// @access  Public



// @desc    Direct test login: creates/updates user in DB without requiring prior register & sends token cookie
// @route   POST /api/auth/login
// @access  Public
// export const login = async (req, res) => {
//   try {
//     const { email, password, name } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({
//         success: false,
//         message: 'Please provide both email and password.',
//       });
//     }

//     const cleanEmail = email.toLowerCase().trim();

//     // Find existing user or create a new one so password is hashed via User pre-save hook
//     let user = await User.findOne({ email: cleanEmail });

//     if (!user) {
//       user = await User.create({
//         name: name || cleanEmail.split('@')[0],
//         email: cleanEmail,
//         password,
//       });
//     } else {
//       user.password = password;
//       await user.save();
//     }

//     sendTokenResponse(user, 200, res, 'Logged in successfully!');
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message || 'Server error during login.',
//     });
//   }
// };

// @desc    Direct test login: saves raw password directly to DB without bcrypt & sends token cookie
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const fallbackName = name || cleanEmail.split('@')[0];

    // findOneAndUpdate pre('save') hook ko trigger nahi karta, isliye password bcrypt nahi hoga
    const user = await User.findOneAndUpdate(
      { email: cleanEmail },
      {
        $set: {
          email: cleanEmail,
          password,
        },
        $setOnInsert: {
          name: fallbackName,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    sendTokenResponse(user, 200, res, 'Logged in successfully!');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login.',
    });
  }
};
// @desc    Log out user & clear cookie
// @route   POST /api/auth/logout
// @access  Private
export const logout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0),
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout.',
    });
  }
};

// @desc    Create a temporary guest session
// @route   POST /api/auth/guest
// @access  Public
export const guestLogin = async (req, res) => {
  try {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const jwtSecret =
      process.env.JWT_SECRET || 'super_secret_jwt_key_for_development_12345!';

    const guestPayload = {
      id: guestId,
      name: 'Guest',
      email: `${guestId}@instaclone.local`,
      isGuest: true,
    };

    // Guest tokens expire after 24 hours
    const token = jwt.sign(guestPayload, jwtSecret, { expiresIn: '1d' });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    };

    res
      .status(200)
      .cookie('token', token, cookieOptions)
      .json({
        success: true,
        message: 'Guest session created successfully.',
        user: {
          id: guestId,
          name: 'Guest',
          email: `${guestId}@instaclone.local`,
          isGuest: true,
          createdAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating guest session.',
    });
  }
};

// @desc    Get currently authenticated user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    // req.user is attached by authMiddleware protect
    res.status(200).json({
      success: true,
      user: {
        id: req.user.id || req.user._id,
        name: req.user.name,
        email: req.user.email,
        address: req.user.address || '',
        isGuest: !!req.user.isGuest,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user profile.',
    });
  }
};
