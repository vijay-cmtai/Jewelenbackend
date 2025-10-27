const asyncHandler = require("express-async-handler");
const Jewelry = require("../models/diamondModel.js");
const { Readable } = require("stream");
const axios = require("axios");
const ftp = require("basic-ftp");
const csv = require("csv-parser");
const {
  processCsvStreamWithMapping,
  convertGoogleSheetsUrl,
} = require("../services/inventoryService.js");

const getSellerId = (req, sellerIdFromRequest) => {
  if (req.user && req.user.role === "Admin" && sellerIdFromRequest)
    return sellerIdFromRequest;
  if (req.user && req.user._id) return req.user._id;
  return null;
};

const getHeaders = (buffer) => {
  return new Promise((resolve, reject) => {
    Readable.from(buffer)
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, ""),
        })
      )
      .on("headers", (headers) => resolve(headers))
      .on("error", reject);
  });
};

const getCollections = asyncHandler(async (req, res) => {
  const categories = await Jewelry.distinct("category");

  if (!categories || categories.length === 0) {
    return res.json([]);
  }

  const collectionsWithImages = await Promise.all(
    categories.map(async (category) => {
      const productForImage = await Jewelry.findOne({
        category: category,
      }).select("images");
      const imageUrl =
        productForImage && productForImage.images.length > 0
          ? productForImage.images[0]
          : null;

      return {
        name: category,
        imageUrl: imageUrl,
      };
    })
  );

  res.json(collectionsWithImages.filter((c) => c.imageUrl));
});

// --- MODIFIED ---
const addJewelry = asyncHandler(async (req, res) => {
  const { sku, name, price, category, sellerId, originalPrice } = req.body;
  if (!sku || !name || !price || !category) {
    return res.status(400).json({
      success: false,
      message: "SKU, Name, Price, and Category are required.",
    });
  }

  // Validate that the discounted price is less than the original price
  if (originalPrice != null && Number(price) >= Number(originalPrice)) {
    return res.status(400).json({
      success: false,
      message: "Discounted price (price) must be less than the original price.",
    });
  }

  const sellerIdToAssign = getSellerId(req, sellerId);
  if (!sellerIdToAssign) {
    return res
      .status(400)
      .json({ success: false, message: "Seller identification failed." });
  }

  const jewelryExists = await Jewelry.findOne({
    sku,
    seller: sellerIdToAssign,
  });
  if (jewelryExists) {
    return res.status(400).json({
      success: false,
      message: "Jewelry with this SKU already exists for this seller.",
    });
  }

  const jewelry = await Jewelry.create({
    ...req.body,
    seller: sellerIdToAssign,
  });

  res.status(201).json(jewelry);
});

// --- MODIFIED ---
const uploadFromCsv = asyncHandler(async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No CSV file uploaded." });

  const { mapping, sellerId } = req.body;
  if (!mapping)
    return res
      .status(400)
      .json({ success: false, message: "Field mapping not provided." });

  const sellerIdToAssign = getSellerId(req, sellerId);
  if (!sellerIdToAssign)
    return res
      .status(400)
      .json({ success: false, message: "Seller identification failed." });

  const userMapping = JSON.parse(mapping);
  const readableStream = Readable.from(req.file.buffer);
  const results = await processCsvStreamWithMapping(
    readableStream,
    userMapping
  );

  // Validate all items before starting the database operation
  for (const item of results) {
    if (
      item.originalPrice != null &&
      Number(item.price) >= Number(item.originalPrice)
    ) {
      return res.status(400).json({
        success: false,
        message: `Data validation failed for SKU '${item.sku}'. Discounted price must be less than original price.`,
      });
    }
  }

  const operations = results.map((item) => ({
    updateOne: {
      filter: { sku: item.sku, seller: sellerIdToAssign },
      update: { $set: { ...item, seller: sellerIdToAssign } },
      upsert: true,
    },
  }));

  if (operations.length === 0) {
    return res
      .status(200)
      .json({ success: true, message: "No data to process." });
  }

  const bulkResult = await Jewelry.bulkWrite(operations, { ordered: false });

  res.status(200).json({
    success: true,
    message: "CSV processed successfully.",
    newItemsAdded: bulkResult.upsertedCount,
    itemsUpdated: bulkResult.modifiedCount,
  });
});

const getJewelry = asyncHandler(async (req, res) => {
  const pageSize = 10;
  const page = Number(req.query.page) || 1;
  const searchTerm = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: "i" } },
          { sku: { $regex: req.query.search, $options: "i" } },
          { category: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  const filter = { ...searchTerm };

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.user) {
    if (req.user.role === "Admin" && req.query.sellerId)
      filter.seller = req.query.sellerId;
    else if (req.user.role !== "Admin") filter.seller = req.user._id;
  }

  const count = await Jewelry.countDocuments(filter);
  const jewelryItems = await Jewelry.find(filter)
    .populate("seller", "name email")
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 });

  res.json({ jewelryItems, page, pages: Math.ceil(count / pageSize), count });
});

const getJewelryById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return res.status(400).json({
      message: "Invalid product ID format",
    });
  }

  const jewelry = await Jewelry.findById(id).populate("seller", "name email");

  if (!jewelry) {
    return res.status(404).json({ message: "Jewelry not found" });
  }

  res.json(jewelry);
});

const getJewelryBySku = asyncHandler(async (req, res) => {
  const jewelry = await Jewelry.findOne({ sku: req.params.sku }).populate(
    "seller",
    "name email"
  );
  if (!jewelry) {
    return res.status(404).json({ message: "Jewelry not found" });
  }

  res.json(jewelry);
});

// --- MODIFIED ---
const updateJewelry = asyncHandler(async (req, res) => {
  const jewelry = await Jewelry.findById(req.params.id);

  if (!jewelry) {
    return res.status(404).json({ message: "Jewelry not found" });
  }

  Object.assign(jewelry, req.body);

  if (
    req.body.hasOwnProperty("originalPrice") &&
    req.body.originalPrice === null
  ) {
    jewelry.originalPrice = undefined;
  }

  if (
    jewelry.originalPrice != null &&
    Number(jewelry.price) >= Number(jewelry.originalPrice)
  ) {
    return res.status(400).json({
      success: false,
      message: "Discounted price (price) must be less than the original price.",
    });
  }

  const updatedJewelry = await jewelry.save();
  res.json(updatedJewelry);
});

const deleteJewelry = asyncHandler(async (req, res) => {
  const jewelry = await Jewelry.findByIdAndDelete(req.params.id);
  if (!jewelry) {
    return res.status(404).json({ message: "Jewelry not found" });
  }
  res.json({ success: true, message: "Jewelry item removed" });
});

const getSellerJewelry = asyncHandler(async (req, res) => {
  const jewelryItems = await Jewelry.find({ seller: req.user._id }).sort({
    createdAt: -1,
  });
  res.status(200).json({ success: true, jewelryItems });
});

const updateJewelryStock = asyncHandler(async (req, res) => {
  const { stockQuantity } = req.body;
  const jewelryId = req.params.id;

  if (stockQuantity === undefined || stockQuantity < 0) {
    res.status(400);
    throw new Error("A valid stock quantity is required.");
  }

  const jewelry = await Jewelry.findById(jewelryId);
  if (!jewelry) {
    res.status(404);
    throw new Error("Jewelry not found.");
  }

  if (
    jewelry.seller.toString() !== req.user._id.toString() &&
    req.user.role !== "Admin"
  ) {
    res.status(403);
    throw new Error("User not authorized to update this item.");
  }

  jewelry.stockQuantity = stockQuantity;
  const updatedJewelry = await jewelry.save();

  res.status(200).json(updatedJewelry);
});

const previewCsvHeaders = asyncHandler(async (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: "No CSV file uploaded." });
  const headers = await getHeaders(req.file.buffer);
  res.status(200).json({ success: true, headers });
});

const previewHeadersFromUrl = asyncHandler(async (req, res) => {
  const { apiUrl } = req.body;
  if (!apiUrl)
    return res
      .status(400)
      .json({ success: false, message: "apiUrl is required." });
  const processedUrl = convertGoogleSheetsUrl(apiUrl);
  const response = await axios.get(processedUrl, { responseType: "text" });
  let headers;
  try {
    const data = JSON.parse(response.data);
    let sampleObject = data.data?.[0] || data.results?.[0] || data[0];
    headers = Object.keys(sampleObject);
  } catch (jsonError) {
    headers = await getHeaders(Buffer.from(response.data));
  }
  if (!headers || headers.length === 0)
    throw new Error("Could not extract any headers.");
  res.status(200).json({ success: true, headers });
});

const previewFtpHeaders = asyncHandler(async (req, res) => {
  const { host, user, password, path } = req.body;
  if (!host || !user || !password || !path)
    return res
      .status(400)
      .json({ success: false, message: "All FTP credentials are required." });
  const client = new ftp.Client();
  try {
    await client.access({ host, user, password, secure: false });
    const buffer = await client.downloadToBuffer(path);
    client.close();
    const headers = await getHeaders(buffer);
    res.status(200).json({ success: true, headers });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: `FTP error: ${error.message}` });
  } finally {
    if (!client.closed) client.close();
  }
});

module.exports = {
  addJewelry,
  uploadFromCsv,
  getJewelry,
  getJewelryById,
  getJewelryBySku,
  updateJewelry,
  deleteJewelry,
  getSellerJewelry,
  updateJewelryStock,
  previewCsvHeaders,
  previewHeadersFromUrl,
  previewFtpHeaders,
  getCollections,
};
