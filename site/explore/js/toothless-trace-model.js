// Copyright (C) 2026 Toit contributors.
//
// Toothless, approach B ("Follow one double"): the pure model. No DOM.
//
// A faithful BigInt port of bench/continued.c from the unpublished Toothless
// sources (F. Loitsch, 2017), instrumented so that every comparison the C code
// makes is recorded together with the exact answer it *should* give (computed
// with the true ratio α = 2^e_k / 10^k instead of the cached fraction).
// The cache below is bench/fraction_values.h, copied verbatim (tag bits
// included): numerator = tn >> 1 with "higher" in bit 0, denominator = td >> 1
// with "lower" in bit 0.

export const TAGGED_NUMERATORS = [
  0x2n, 0x8n, 0x20n, 0x80n, 0x400n, 0x1000n, 0x4000n, 0x20000n,
  0x80000n, 0x200000n, 0x1000000n, 0x4000000n, 0x10000000n, 0x80000000n, 0x200000000n, 0x800000000n,
  0x4000000000n, 0x10000000000n, 0x40000000000n, 0x200000000000n, 0x800000000000n, 0x2000000000000n, 0x10000000000000n, 0x40000000000000n,
  0x100000000000000n, 0x800000000000000n, 0x2000000000000000n, 0x8000000000000000n, 0xe1237f88aad0ea1en, 0x2d071981bbc36206n, 0x47bd58966cbb0b37n, 0x79ce14e325cbfd73n,
  0x8b24f8514f20de3bn, 0x612fbf6281f3af92n, 0x590d6bb92866f4a1n, 0x6e8b5c57e19cbaaan, 0x2c37be898d71e444n, 0x3d6a52e06a8fd73bn, 0xbd27711fe4b12282n, 0x245b16edc55b6f94n,
  0x651c56e665a07582n, 0x98ea23ad4c3e13dan, 0x98ea23ad4c3e13dan, 0x71fe0294afb062acn, 0xc064581d56ca4ecfn, 0xafef5f2134fa5eb2n, 0x387364e9738d109en, 0x60585bb9ee21c6d6n,
  0x6d971a344ee8758en, 0x957e86b65d30eeddn, 0xef30d78a2eb4b161n, 0x45784d4af81188b7n, 0x54867d83556d0a64n, 0x243d91de522b8487n, 0xe7f0725ba77ce9dn, 0x39fc1c96e9df3a71n,
  0x5ab20915d8acfb25n, 0x132de0f22d4b7d02n, 0x6b1435c5654576bbn, 0x4372269fe75caa2an, 0x4372269fe75caa2an, 0x1c99c8e4087da127n, 0x1c99c8e4087da127n, 0xc1de956dc2f2d155n,
  0x979a18f928a93b7an, 0x6b4e99b320234c70n, 0xc9831397b5b63207n, 0x83638b99dbe0d6b2n, 0x3e1689f64cb22ef1n, 0x3c6d1affd628918en, 0x574170f08314facbn, 0x72220e963dab8172n,
  0xb2a388f0ca47f7d2n, 0x7f08c0a859cacc52n, 0x47fd405b15010453n, 0x950d5a60dbb51c52n, 0x950d5a60dbb51c52n, 0x88949226935c0488n, 0x893c02fad1001294n, 0xb3f979103d3d06abn,
  0x5530a34295aec616n, 0x884dd20422b13cf0n, 0x5b71643bb91aa3a9n, 0x7a96696193ba0acan, 0x35c77cd4b4f04b02n, 0xac17f5dbdc9a89an, 0x89acc4afe3aed48n, 0x44d66257f1d76a40n,
  0xc716e2d594cb8f11n, 0x3159b5626414930fn, 0x62b36ac4c829261dn, 0x186834281506b2cfn, 0x8f46f1ef9a0a9e7fn, 0x4fe137630ed553ffn, 0x5575b900422a999an, 0x533a51f494087dc3n,
  0x126e62d3dc1cfc3an, 0xebeb57649b0c9c8n, 0x94a58e76ba3a69e2n, 0x59aab89d937742c3n, 0x4516456a87f1dffdn, 0x4ea4676f1d2acbcfn, 0x5ecf8d943a140a6bn, 0x5ecf8d943a140a6bn,
  0x5ecf8d943a140a6bn, 0x194ff4a3cdea18bn, 0x93957df8f1dd3976n, 0x388099eccc277aecn, 0x2f253523b31510a3n, 0x25b75db628dda6e9n, 0x592f5af72c4b8314n, 0x8306e88a30546d2bn,
  0xd1a4a74380871511n, 0xbb253ffb4ce053bfn, 0x552491f33dad46acn, 0x883a831ec9153de0n, 0x6c715b1bbbb493bn, 0x6ba097c1e1b8560en, 0x561a1301816044d8n, 0x95b96b2017e380dbn,
  0x65d2d725e0ed5206n, 0x251db9be482b27cbn, 0xb1c3a288b7f35ff5n, 0x8e361ba093291991n, 0x71c4e2e6dc20e141n, 0x60ff76dc91fbeb2an, 0x76f2eb1263bf44fn, 0x2f945e075b194edn,
  0x9ddf7d11537fb17fn, 0x7e4c640ddc662799n, 0xe2fd267be5997aan, 0x38bf499ef9665ea8n, 0x4458ba13fa070485n, 0x78d4361d8fb296d3n, 0x3d05e0e0f02a314dn, 0xaec23483a27be2e8n,
  0x377772667e8a4ebn, 0xb353ab8588f273f2n, 0x3a0d501081349d0bn, 0xb9c4336803db903n, 0x75eb288c86a0928an, 0x17956e8281535082n, 0x9954726d5026b69bn, 0xc621bd2c445cc6e9n,
  0x482f4b56c2dac013n, 0x7331d088f4fa2be3n, 0x5bf47b16fddaeaf4n, 0x49c3c168f79c5a85n, 0x3b030120c616aed1n, 0x82ba941a7c2a307bn, 0xb56a3e3d499e1c3en, 0x6c12c90aaa904377n,
  0x6c12c90aaa904377n, 0xc0ad6c947e63c6adn, 0x394f9a1e5eaaf4bcn, 0x7f477f2c6ba6d2e8n, 0xa324a87b4b3b335n, 0x95bf2a6e276ba62en, 0x6f855cba13e65477n, 0x8922be28c05fd4e9n,
  0x825b833ab00836a5n, 0x495008549ed3a60an, 0x754cda20fe1f7010n, 0x857d5a9615e52f07n, 0x51aef2b8fd05ff26n, 0x3b5f0cce6996a2aan, 0x5eeadf81fc660517n, 0x684b5995c606206fn,
  0xaeadc4ed5d1c4679n, 0xb211dcc061cddf83n, 0x88aebc8130c995a7n, 0x57ebff45394449an, 0x57ebff45394449an, 0x15faffd14e511268n, 0x7a788803cac88e15n, 0x61fa06696f06d811n,
  0x968c6757a4053a8fn, 0x18374730a77bfa70n, 0xb26592cf97d3cdc3n, 0x59ec4c301aa678dan, 0x1a060869502dfedcn, 0x8be2178ea50c574bn, 0x63bac4057e5552ean, 0x7bd25c8afbf6558bn,
  0x621f97b853d31f8an, 0x958693700b5bd82n, 0x958693700b5bd82n, 0x648d6ac92bf3f94bn, 0x6e58d950f23bf2a8n, 0x1f252b16ba9d3087n, 0x45972d998504d836n, 0x37ac247ad0d0acf8n,
  0x2f0c76516cf111cbn, 0x863f3e065d538607n, 0x863f3e065d538607n, 0x7561c890cdae64e6n, 0x49cd5ca19823432bn, 0x49cd5ca19823432bn, 0x25c313d742da83d6n, 0x78d6a5e40921a5en,
  0x78d6a5e40921a5en, 0x78d6a5e40921a5en, 0x78d6a5e40921a5en, 0xbc56ffd907292ed7n, 0x5600dbed0515b21en, 0x36de5f279c0c9365n, 0xc770e76dd831adeen, 0x463b5b13faf16081n,
  0x3f7aa8651f5cb4c2n, 0xc770e76dd831adeen, 0x60785aa727a566f2n, 0x68456399cbeda6fen, 0x536ab614a3248598n, 0x42bbc4dd4f506ae0n, 0x4cb66232d66433bfn, 0x657391bd03a950f0n,
  0x46e4283ce508ada6n, 0x5785d20c77501107n, 0x62f4eb777a850208n, 0x31da4423b54d93ean, 0x4531e1f20a8e173en, 0xc90b94d04a80b412n, 0xf2596fe5ff1882en, 0x6a4ebddfaf01729dn,
  0xe674a7d68b7643d0n, 0x33aac5ede90c716dn, 0x1167326daf74bb7an, 0xa2b8be42026013dfn, 0xa2b8be42026013dfn, 0x583bfa9f65225be6n, 0x249fa2ea7d27f9ban, 0x1d4c825530ecc7c8n,
  0x75320954c3b31f20n, 0x8f8881931979ef47n, 0x1cb4e6b70518630fn, 0x3969cd6e0a30c61dn, 0x67055c265cc94803n, 0xbd7278ca11755782n, 0xa4d5603d61420cd1n, 0x7f95e8ce16bbb517n,
  0x6220ab2d33b2be0an, 0x4e8088f0f6289808n, 0x82f3f0e9746c311an, 0x4e4b0bb93a4607bfn, 0x9c961772748c0f7dn, 0x17f351c169831c77n, 0x494dfbb97a7c462an, 0x494dfbb97a7c462an,
  0x8259d378f0321d74n, 0xd08fb8c180502f20n, 0x8ec50c1986a9e843n, 0x8ec50c1986a9e843n, 0xb2c18873d1c66885n, 0x8f0139f6416b86d1n, 0x20150118b7378bb6n, 0xc5d131387719a3e7n,
  0x6f2eae22905f21b1n, 0x5a3ebeb3a47a2b55n, 0xd749fcb0c02a579dn, 0x41e2cc00376df776n, 0x58283c2f3c0b68b7n, 0xb020f7758067f22an, 0xaf62f3d1a1ac7522n, 0x313a1be446aa723en,
  0x313a1be446aa723en, 0xc4e86f911aa9c8f8n, 0x1281626f5471f217n, 0x5734b0003ad6d5a6n, 0x5734b0003ad6d5a6n, 0x919c19bd6c2c0417n, 0x2aab6590c8c7b0fcn, 0x44456f4e0e0c4e60n,
  0xaa09b5d88e667f02n, 0x86b5210836edca0an, 0xdb801fc908dc492an, 0x591f7d28a4ef85a3n, 0x6db2a9c14a1f3e17n, 0x6db2a9c14a1f3e17n, 0x7f3dbed056e46ad3n, 0x82caae55ee7e2c2an,
  0x26fdfe64404d148cn, 0x81a7d2542461736bn, 0x81a7d2542461736bn, 0xe1ea8880d3578afen, 0x38ea11efe707c994n, 0x3c842e3c8d32a35bn, 0xd9172e77d2d5df43n, 0x6af8623f65b6166n,
  0xd5f0c47ecb6c2ccn, 0x5d45155eb07f8377n, 0xba8a2abd60ff06edn, 0x47fb2adf0f83ff06n, 0x47fb2adf0f83ff06n, 0x96223b9fcc6d047cn, 0x8eba5af762c0965cn, 0xf429e8486e5fb96n,
  0x186a973a716ff8f0n, 0x72caf2f42b7011b6n, 0x2a7ddcc5fd09977en, 0x84adaeff7c41668dn, 0x6a248bff969ab871n, 0x7d5be7accddc0588n, 0xc8930c47afc66f40n, 0x61b292480c55cc1an,
  0x740f2dece80cc18fn, 0xa3e5756e2bb14c9en, 0x859347e8ff113466n, 0x5e3526aebfe0bc34n, 0xc449ed9c59319072n, 0x193200c91e338020n, 0x3f317d1188213d02n, 0xcd4569f82110c772n,
  0x74e2de79dd2b3de6n, 0x90a3ccf1cf747806n, 0x6b3c7b832247e957n, 0x15727f1a3a0e61dfn, 0x2ae4fe34741cc3bdn, 0xf6d1c2976cc065d1n, 0x4142698fa8983923n, 0x99345356de85dce6n,
  0xea007b696214a67en, 0xc6539fdc506ba68an, 0x44349c69b7cfee12n, 0x4576a716af9d8ecen, 0xb195ff3575df57een,
];

export const TAGGED_DENOMINATORS = [
  0x2n, 0xan, 0x32n, 0xfan, 0x4e2n, 0x186an, 0x7a12n, 0x2625an,
  0xbebc2n, 0x3b9acan, 0x12a05f2n, 0x5d21dban, 0x1d1a94a2n, 0x9184e72an, 0x2d79883d2n, 0xe35fa931an,
  0x470de4df82n, 0x16345785d8an, 0x6f05b59d3b2n, 0x22b1c8c1227an, 0xad78ebc5ac62n, 0x3635c9adc5dean, 0x10f0cf064dd592n, 0x54b40b1f852bdan,
  0x1a784379d99db42n, 0x84595161401484an, 0x295be96e64066972n, 0xcecb8f27f4200f3an, 0xe354fb1716b633d9n, 0x38d53ec5c5ad8cf7n, 0x712f6831eff7323an, 0xf037d0121cced9ecn,
  0xab823c40af8eda06n, 0x95bd521affa78f9fn, 0xab823c40af8eda06n, 0x85101dcb28304ca5n, 0x42880ee594182653n, 0x73826785203c4d0en, 0xde597b7e12d30163n, 0x356b89fc794b5a2bn,
  0xb9b605ebb5e5cfc3n, 0xaf89906b60d37161n, 0xdb6bf48639084db9n, 0xcc76a9df9e14db1fn, 0xd7adc9951201675cn, 0xf6899a2d923e1993n, 0x62e16546318e9963n, 0x6979a97bc6af82a7n,
  0x95f828f6af9e2065n, 0xffb86441b24616fan, 0xffb86441b24616fan, 0x5cd6a0960da45a3an, 0x8d329eea0c5fbd1fn, 0x25d63c1d85095804n, 0x12eb1e0ec284ac02n, 0x5e979649cc975c0an,
  0x5c789e075b5347f6n, 0x187182ab5d9f5e8bn, 0xaa962b8ac4ceaeaan, 0x864f34e550494e31n, 0x53f1810f522dd0dfn, 0x2c7ee501c4c79bf8n, 0x379e9e4235f982f6n, 0xeba2a20858c39f3en,
  0xe653d3600220214dn, 0xcbc9ca1650eeab93n, 0xef2f128f9d4439b2n, 0xc2f077f7fdd9480bn, 0x73260f8d70f2a6ean, 0x460aa8175e7d5ca3n, 0x7e6ce96af58ff97cn, 0xceb5de95299d65f5n,
  0xca3643546c0084dfn, 0xb3bf3bf2550280f1n, 0x7f53954ffcf044fan, 0xa4c4443d0dbeabc9n, 0xcdf5554c512e56bbn, 0xebe7fc4d1e156357n, 0x9425bf2ca4a26663n, 0xf2db9b1de106ff44n,
  0x8fb1c1925bf29543n, 0x8fb1c1925bf29543n, 0x78804e0ecc098966n, 0xc9edafd1e9693f75n, 0x375dc97df02f8a49n, 0xdd7725f7c0be293n, 0xdd7725f7c0be293n, 0x45353bdd6c3b6cdbn,
  0xfa3382535778ff12n, 0x4d866afcccc1c4f4n, 0xc1d00b77ffe46c62n, 0x1df44108539c4cben, 0xdbccdd8fc1284decn, 0x992db77021046d68n, 0x666ca6958c4d6653n, 0x7cafc643338b6eeen,
  0x2283fb8888b82cb5n, 0x1141fdc4445c165bn, 0xd97942da9a42baabn, 0xa3fb21869593dda2n, 0x4ef72f57a366dcb6n, 0x705bdadf11e9461cn, 0xa952ffa35406d640n, 0x69d3dfc6148445e8n,
  0x8448d7b799a55762n, 0x2c256f057b71274n, 0xa0df405ef1852f3fn, 0x4cfcb3830b1dc08fn, 0x504c149944e42efcn, 0x28260a4ca272177en, 0x76abaf874741a9c3n, 0xd9eec3abb952028an,
  0xd9eec3abb952028an, 0xf32e891b30f8a208n, 0x8a4bcb1d4a043f63n, 0x8a4bcb1d4a043f63n, 0x899c5a712bf5dd2n, 0xaab84c7ad7d577c7n, 0xaab84c7ad7d577c7n, 0xb98af15695074fecn,
  0x9dba7e82eaf27fcfn, 0x47de271d3c455632n, 0xd720a7eaf4c0754en, 0xd720a7eaf4c0754en, 0xd720a7eaf4c0754en, 0x72a25a3de2406687n, 0xafb86da74dfabf4n, 0x57dc36d3a6fd5fan,
  0xb6346aee2263888en, 0xb6346aee2263888en, 0x199552b1fb23eb45n, 0x3ff54ebcf3d9cc2bn, 0x604a19fa78d5839an, 0xd4c932fb64c859dan, 0x432a53ba3dd8ce0an, 0xf06fc3694b4860d3n,
  0x5f63df39e9f3a56n, 0xc0c05389993bbc29n, 0x4dff4aa47f6b12b8n, 0x137fd2a91fdac4aen, 0x7bc67f9af3e9dc91n, 0x1ef19fe6bcfa7725n, 0xfb7a313bbd6d3848n, 0xcb19285eb728c5fen,
  0x5c7e220829e619a2n, 0xb880d8f045866444n, 0x5c0cffd572261be3n, 0x5c4d47a0ceea77b2n, 0x5c4d47a0ceea77b2n, 0xff987dc81d496eb8n, 0xddaf3d2a54e23399n, 0xa514225f430d54f8n,
  0xce592af713d0aa36n, 0xe5edbb2f6f0179e2n, 0x557d29514583b95bn, 0xed52b48d7edfb023n, 0xbe1f1a08dcb2eean, 0xda231c67b05581b5n, 0xcb111370d8812adan, 0x9c1150d25855f5dan,
  0xb9712a756870f6fan, 0x825d7263aa3e54dfn, 0x825d7263aa3e54dfn, 0xb97273676e4efef0n, 0x8dd87e95e3de6b43n, 0x407001ada233f2a7n, 0x80c569bd65a0ba82n, 0xb0dd915c6a079038n,
  0xb924180197b5497an, 0xebeb39b83b3d2132n, 0xe25b9c1ed21193ben, 0x5b00f696abff709n, 0x71c1343c56ff4cbn, 0x238c6052db2fc7f3n, 0x7bcaf08cf96c2a82n, 0x7bcaf08cf96c2a82n,
  0xedc55e2b753891a2n, 0x2fcea778a6e3e5c3n, 0xdc1eb9f0ab87feean, 0x8ab1538f4ef0d1cfn, 0x322bf8e5f9c1557fn, 0xa88db9df6d773530n, 0x96366fe9981afc97n, 0xe920163642ad4028n,
  0x7376b1ab114f4527n, 0xdbefe4f58254fd1n, 0x112ebde32e2ea3c5n, 0x738c799fb514f754n, 0x9e815457a88990bfn, 0x37ec108cdda7bf62n, 0x4e184e81f63712b3n, 0x4e184e81f63712b3n,
  0x527f54f3faf2a9den, 0x931f38b23a1de7c0n, 0xb7e706dec8a561b0n, 0xc8ffc743b3325433n, 0x4efc0ae3bc266c50n, 0x62bb0d9cab300764n, 0x3f25759679681801n, 0x7e4aeb2cf2d0301n,
  0x9ddda5f82f843c1n, 0xc5550f763b654b1n, 0x7b5529a9e51f4efn, 0xf048be02849e65a8n, 0x8927698ad05b2ab7n, 0x6d6095c37d884a72n, 0xf87bc3b5fcc90a01n, 0x6d6095c37d884a72n,
  0x7b9371b71f742eefn, 0xf2a8dd1fb8dc53c5n, 0x92b8064043a0ce63n, 0xc63a93ab0443b3e5n, 0x631d49d58221d9f3n, 0x631d49d58221d9f3n, 0x8e6b575a93247034n, 0x75b7b345a7d6f083n,
  0x66d268d3db56ae03n, 0x9eae3ffe9a37a762n, 0x7021b75afb26d793n, 0x469cc6609f48acbbn, 0x7a82f399921e6249n, 0xde790b4b250114adn, 0x14f3956d3212b843n, 0xb7cf2db28ced1caen,
  0xf90a778c3e02f447n, 0x45cad0ae62f0857en, 0x1d62a3539213f4cdn, 0xabb91a6a3fa606a8n, 0xd6a76104cf8f8852n, 0x917e16a65c623f13n, 0x25be6106adac8293n, 0x25be6106adac8293n,
  0xbcb7e521645e8cdbn, 0x9074c1392ad651b0n, 0x241d304e4ab5946cn, 0x5a48f8c3bac5f30en, 0xca81a7ad2d47efd8n, 0xe8bee06a34d0802dn, 0xfd2211987899ebcen, 0xf4ea30cf3eb7234an,
  0x75bab59b3da4eb5fn, 0x75bab59b3da4eb5fn, 0xf57caf3b69d8c9dfn, 0x5bbb3262498f7c6cn, 0xe553fdf5b7e6b70en, 0x2bd883086e897bdcn, 0x53df9f6c26a487f9n, 0x68d78747304da9f7n,
  0xe909d6905c497bc3n, 0xe909d6905c497bc3n, 0xc7681beb55b7c2b0n, 0xf94222e62b25b35cn, 0xc30dc05787ca6252n, 0xc30dc05787ca6252n, 0x36b2d38ec326748fn, 0xd2cb2ffeb1fcfadan,
  0x94183e339439aeeen, 0x964205c5a1c552a6n, 0xe008ebed2a30b5a6n, 0x55b3fc630a675c07n, 0x8f576031ecfb415en, 0xb2fcf1e995dc72b7n, 0xdecacebbdf7f7467n, 0x4e2a751693ca3af1n,
  0x61b5125c38bcc9adn, 0xf444ade68dd7f82fn, 0x1cb206abb00c89c2n, 0xa90839b0ad1267e1n, 0x69a5240e6c2b80edn, 0xdc7f73d52dc69c6en, 0x50c4b7a98a088fcbn, 0x50c4b7a98a088fcbn,
  0xfb7466127ef77d49n, 0xf9026aea9b0d1509n, 0xfd9821d566649881n, 0x80b51d21dd416db2n, 0xc606aa5e0c570cd0n, 0x7bc42a7ac7b66802n, 0xb373046325b9f252n, 0xe6921edb6048cf0dn,
  0x2af63154baa88997n, 0xb29191c386f0c9b8n, 0xdf35f63468acfc26n, 0xf314c88e75e3bf23n, 0x4c8c5fdb2666e9f7n, 0x65bdbcb58b6f0c4en, 0xe41c41b7b357d052n, 0x8c8011491a49c2dn,
  0x15f402b36c1b866fn, 0x5fb5178a9d1d4374n, 0xef44bada88c928a2n, 0x7368eab36a804bb1n, 0x482192b022902f4fn, 0xbc0eebc3ef931e0bn, 0xdf7a2b2385b7e9e3n, 0x1dde04a75701a72fn,
  0x1dde04a75701a72fn, 0xaf8661d8fb2fbbf3n, 0x51371e476b8dfff7n, 0x9e7ea399a9512af6n, 0x9e7ea399a9512af6n, 0xe9fc6a2bfaf19a83n, 0xe9fc6a2bfaf19a83n, 0x8e77068cf8a8fe07n,
  0xd38cf565895ba31an, 0xbab7860b48e9922bn, 0xbe37b246c0b44f89n, 0xa7b1f43768d78a37n, 0xda60e699640ea7ebn, 0x2309d5508404ec9bn, 0x6dd9f55f8c0a6d71n, 0xdf04eee7c78d2db5n,
  0x9ebd91c3852d1207n, 0xf58a4501baf6d11dn, 0x71c706b0338efe30n, 0x1c71c1ac0ce3bf8cn, 0x471c642e20395eden, 0xffbcb5a0f65bcb06n, 0x548588db68cf2dean, 0xf807ea3e42e838a9n,
  0xecc6231856dda8c9n, 0xfad85c07bdeadca1n, 0x6bd566d89e24ed83n, 0x894730eed0f07613n, 0xdb5906f402a34c17n,
];

export const LOG10_2_SHORTCUT = 315652; // ≈ log10(2) · 2^20
export const LOG2_10_SHORTCUT = 3483294; // ≈ log2(10) · 2^20

// ---------------------------------------------------------------- helpers

const MASK52 = (1n << 52n) - 1n;
const view = new DataView(new ArrayBuffer(8));

export function bitsOf(v) { view.setFloat64(0, v); return view.getBigUint64(0); }
export function fromBits(b) { view.setBigUint64(0, b); return view.getFloat64(0); }

export function bitLength(x) {
  if (x < 0n) x = -x;
  return x === 0n ? 0 : x.toString(2).length;
}

/** log2 of a positive BigInt, as a float with ~15 significant digits. */
export function log2Big(x) {
  const n = bitLength(x);
  if (n <= 53) return Math.log2(Number(x));
  const top = Number(x >> BigInt(n - 53));
  return Math.log2(top) + (n - 53);
}

/** log10 of a positive BigInt. */
export function log10Big(x) {
  if (x <= 0n) return -Infinity;
  const s = x.toString();
  const head = Number(s.slice(0, 17)) / 10 ** (Math.min(17, s.length) - 1);
  return s.length - 1 + Math.log10(head);
}

export function gcd(a, b) {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[n];
}

/** Exact floor(log2(10^i)) = bit length of 10^i minus one. */
export function exactLog2Pow10(i) { return bitLength(pow10(i)) - 1; }

/** Exact floor(log10(2^n)) for n ≥ 1 = number of decimal digits of 2^n minus one. */
export function exactLog10Pow2(n) { return (1n << BigInt(n)).toString().length - 1; }

/** Decimal rendering of a positive rational to `digits` significant digits (truncated). */
export function ratioToString(n, d, digits = 20) {
  if (n === 0n) return "0";
  let e = Math.floor(log10Big(n) - log10Big(d));
  // make 10^e ≤ n/d < 10^(e+1) exact
  const ge = (a, b, ee) => (ee >= 0 ? a >= b * pow10(ee) : a * pow10(-ee) >= b);
  while (!ge(n, d, e)) e--;
  while (ge(n, d, e + 1)) e++;
  const shift = digits - 1 - e;
  const q = shift >= 0 ? (n * pow10(shift)) / d : n / (d * pow10(-shift));
  const s = q.toString();
  const mant = s[0] + (s.length > 1 ? "." + s.slice(1) : "");
  return e === 0 ? mant : `${mant}e${e > 0 ? "+" : ""}${e}`;
}

/** Relative distance |a/b − P/T| / (P/T) as log10 (−Infinity when equal). */
export function log10RelDistance(a, b, P, T) {
  let diff = a * T - b * P;
  if (diff < 0n) diff = -diff;
  if (diff === 0n) return -Infinity;
  return log10Big(diff) - log10Big(b) - log10Big(P);
}

function cmp(a, b, c, d) { // sign(a/b − c/d), all positive
  const x = a * d - b * c;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
}

/**
 * Simplest fraction strictly between lo = ln/ld and hi = hn/hd (0 ≤ lo < hi).
 * "Simplest" = smallest denominator; it also has the smallest numerator, so
 * every fraction strictly inside the interval has numerator ≥ n and
 * denominator ≥ d.
 */
export function simplestBetween(ln, ld, hn, hd) {
  const fl = ln / ld;
  if ((fl + 1n) * hd < hn) return { n: fl + 1n, d: 1n };
  const l2 = ln - fl * ld; // lo − fl = l2/ld ∈ [0, 1)
  const h2 = hn - fl * hd; // hi − fl = h2/hd ∈ (0, 1]
  let y;
  if (l2 === 0n) y = { n: hd / h2 + 1n, d: 1n };
  else y = simplestBetween(hd, h2, ld, l2);
  return { n: fl * y.n + y.d, d: y.n };
}

// ---------------------------------------------------------------- the ratio α

/** α_i = 2^{e_i} / 10^i with e_i = ⌊log2 10^i⌋, so α_i ∈ (1/2, 1]. */
export function alphaOfIndex(i) {
  const T = pow10(i);
  const e = bitLength(T) - 1;
  return { P: 1n << BigInt(e), T, e };
}

/** Continued-fraction terms of p/q. */
export function cfTerms(p, q) {
  const t = [];
  while (q) { const a = p / q; t.push(a); [p, q] = [q, p - a * q]; }
  return t;
}

/** Convergents h/k of p/q, with the term a that produced them. */
export function convergents(p, q) {
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  const out = [];
  for (const a of cfTerms(p, q)) {
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    out.push({ a, h: h1, k: k1 });
  }
  return out;
}

/**
 * The closest fraction to p/q whose numerator and denominator are both below
 * `limit`: the closer of the last convergent that fits and the largest
 * semiconvergent that fits (these two are Farey neighbours, so either one
 * leaves no fraction of that size between itself and p/q).
 */
export function bestApproximation(p, q, limit) {
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  let best = null;
  for (const a of cfTerms(p, q)) {
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (h2 < limit && k2 < limit) {
      [h0, h1, k0, k1] = [h1, h2, k1, k2];
      best = { n: h1, d: k1 };
      continue;
    }
    let c = a;
    if (h1) { const ch = (limit - 1n - h0) / h1; if (ch < c) c = ch; }
    if (k1) { const ck = (limit - 1n - k0) / k1; if (ck < c) c = ck; }
    if (c >= 1n) {
      const cand = { n: c * h1 + h0, d: c * k1 + k0 };
      if (!best) return cand;
      const x = { n: p, d: q };
      const dc = absDiff(cand, x), db = absDiff(best, x);
      if (cmp(dc.n, dc.d, db.n, db.d) < 0) best = cand;
    }
    return best;
  }
  return best;
}

function absDiff(u, v) {
  let n = u.n * v.d - v.n * u.d;
  if (n < 0n) n = -n;
  return { n, d: u.d * v.d };
}

// ---------------------------------------------------------------- tables

function makeTable(tn, td, bits, label) { return { tn, td, bits, label }; }

export const ORIGINAL = makeTable(TAGGED_NUMERATORS, TAGGED_DENOMINATORS, 63, "original");

const budgetCache = new Map();
/** Rebuild the whole cache with fractions whose parts are below 2^bits. */
export function buildTable(bits) {
  if (budgetCache.has(bits)) return budgetCache.get(bits);
  const limit = 1n << BigInt(bits);
  const tn = [], td = [];
  for (let i = 0; i < 325; i++) {
    const { P, T } = alphaOfIndex(i);
    const { n, d } = bestApproximation(P, T, limit);
    const c = cmp(n, d, P, T);
    tn.push((n << 1n) | (c > 0 ? 1n : 0n));
    td.push((d << 1n) | (c < 0 ? 1n : 0n));
  }
  const table = makeTable(tn, td, bits, `${bits}-bit`);
  budgetCache.set(bits, table);
  return table;
}

/** Entry i of a table, as stored (not inverted). */
export function entryOf(table, i) {
  const tn = table.tn[i], td = table.td[i];
  const num = tn >> 1n, den = td >> 1n;
  const higher = (tn & 1n) === 1n, lower = (td & 1n) === 1n;
  return { index: i, num, den, higher, lower, exact: !higher && !lower };
}

// ---------------------------------------------------------------- exponent shortcuts

/** k, e_k and the table index for a boundary exponent e_b (continued.c). */
export function pickScale(eb) {
  if (eb < 0) {
    const n = ((LOG10_2_SHORTCUT * -eb) >> 20) + 1;
    const ne = (LOG2_10_SHORTCUT * n) >> 20;
    return { k: -n, ek: -ne, index: n, reciprocal: true, diff: eb + ne };
  }
  const k = (LOG10_2_SHORTCUT * (eb + 1)) >> 20;
  const ek = (LOG2_10_SHORTCUT * k) >> 20;
  return { k, ek, index: k, reciprocal: false, diff: eb - ek };
}

/** α = 2^{e_k} / 10^k as an exact pair P/T (works for both signs of k). */
export function alphaOf(k, ek) {
  const P = k >= 0 ? 1n << BigInt(ek) : pow10(-k);
  const T = k >= 0 ? pow10(k) : 1n << BigInt(-ek);
  return { P, T };
}

// ---------------------------------------------------------------- decode + boundaries

export function decode(v) {
  if (!(Number.isFinite(v) && v > 0)) throw new RangeError("Toothless handles positive, finite, nonzero doubles");
  const bits = bitsOf(v);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & MASK52;
  const f = biased ? fraction | (1n << 52n) : fraction;
  const e = biased ? biased - 1075 : -1074;
  return { v, bits, biased, fraction, f, e, odd: (bits & 1n) === 1n, powerOfTwo: fraction === 0n };
}

export function boundaries(d) {
  let low = d.f * 2n - 1n, exact = d.f * 2n, up = d.f * 2n + 1n, eb = d.e - 1;
  if (d.powerOfTwo) { up *= 2n; exact *= 2n; low = low * 2n + 1n; eb--; }
  return { low, exact, up, eb };
}

// ---------------------------------------------------------------- the algorithm

const TABLE1 = {
  // [p⁻ adjustment, p⁺ adjustment] — the paper's Table 1, as the C code applies it
  "exact/even": [0, 0], "exact/odd": [1, -1],
  "lower/even": [1, 0], "lower/odd": [1, 0],
  "higher/even": [0, -1], "higher/odd": [0, -1],
};
export { TABLE1 };

/**
 * Run continued.c on v with the given cache and record everything.
 * Each entry of `rows` is one integer comparison the C code makes:
 *   { kind, a, b, op, lhs, rhs, cached, truth, ... }
 * where the comparison is equivalent to "a/b  op  num/den" and `truth` is
 * the same question asked of the exact α.
 */
export function trace(v, table = ORIGINAL, opts = {}) {
  const maxDigits = opts.maxDigits ?? 30;
  const maxWalk = opts.maxWalk ?? 12;
  const d = decode(v);
  const bnd = boundaries(d);
  const sc = pickScale(bnd.eb);
  const raw = entryOf(table, sc.index);
  const num = sc.reciprocal ? raw.den : raw.num;
  const den = sc.reciprocal ? raw.num : raw.den;
  const higher = sc.reciprocal ? raw.lower : raw.higher;
  const lower = sc.reciprocal ? raw.higher : raw.lower;
  const exactEntry = !higher && !lower;
  const { P, T } = alphaOf(sc.k, sc.ek);
  const shift = BigInt(sc.diff);
  const fLs = bnd.low << shift, fs = bnd.exact << shift, fUs = bnd.up << shift;

  // Scaled boundaries and the Table 1 tweaks.
  let pU = fUs * num, pL = fLs * num;
  const pU0 = pU, pL0 = pL;
  const tableKey = `${exactEntry ? "exact" : higher ? "higher" : "lower"}/${d.odd ? "odd" : "even"}`;
  if (d.odd) {
    if (exactEntry) { pU--; pL++; } else { pU -= higher ? 1n : 0n; pL += lower ? 1n : 0n; }
  } else { pU -= higher ? 1n : 0n; pL += lower ? 1n : 0n; }

  const rows = [];
  const inclusive = !d.odd; // boundary decimals are allowed when f is even

  // R = ⌊p⁺ / den⌋. Truth: the largest integer ≤ f⁺_s·α (even) or < f⁺_s·α (odd).
  const Rfull = pU / den;
  let Rtrue = (fUs * P) / T;
  if (!inclusive && Rtrue * T === fUs * P) Rtrue--;
  {
    // The two questions that pin R: R/f⁺_s ≤ α and (R+1)/f⁺_s > α. Show the tighter one.
    const m0 = log10RelDistance(Rfull, fUs, P, T), m1 = log10RelDistance(Rfull + 1n, fUs, P, T);
    const tight = m0 >= m1 ? { a: Rfull + 1n, m: m1 } : { a: Rfull, m: m0 };
    rows.push({
      kind: "upper", a: tight.a, b: fUs, margin: tight.m,
      lhs: Rfull * den, rhs: pU, lhs1: (Rfull + 1n) * den,
      cached: Rfull, truth: Rtrue, agrees: Rfull === Rtrue,
    });
  }

  // Digit loop.
  let dd = 1n, dexp = sc.k;
  while (dd * 10n <= Rfull) { dd *= 10n; dexp++; }
  const topPlace = dexp;
  let rem = Rfull, R = 0n;
  const digits = [];
  let broken = null;
  for (;;) {
    const digit = rem / dd;
    if (digit > 9n) { broken = "digit"; }
    digits.push(Number(digit));
    R += digit * dd;
    const accept = R * den >= pL;
    const c = cmp(R, fLs, P, T);
    const truth = inclusive ? c >= 0 : c > 0;
    rows.push({
      kind: "prefix", a: R, b: fLs, dd, place: dexp, digitsSoFar: digits.join(""),
      lhs: R * den, rhs: pL, cached: accept, truth, agrees: accept === truth,
      margin: log10RelDistance(R, fLs, P, T), onAlpha: c === 0,
    });
    if (accept) break;
    if (digits.length >= maxDigits || dd === 1n) { broken = broken || "no-stop"; break; }
    rem %= dd; dd /= 10n; dexp--;
  }
  const lengthBeforeWalk = digits.length;
  const Rloop = R;

  // Closeness walk.
  const X = fs * num;
  const walk = [];
  let fixup = null, tie = null;
  const pre = R * den > X;
  {
    const c = cmp(R, fs, P, T);
    rows.push({
      kind: "above", a: R, b: fs, lhs: R * den, rhs: X, cached: pre, truth: c > 0, agrees: pre === (c > 0),
      margin: log10RelDistance(R, fs, P, T), onAlpha: c === 0,
    });
  }
  if (pre) {
    for (let guard = 0; ; guard++) {
      const lhs = 2n * R * den, rhs = 2n * X + dd * den;
      const go = lhs > rhs;
      const a = 2n * R - dd, b = 2n * fs;
      const c = cmp(a, b, P, T);
      rows.push({
        kind: "walk", a, b, R, dd, lhs, rhs, cached: go, truth: c > 0, agrees: go === (c > 0),
        margin: log10RelDistance(a, b, P, T), onAlpha: c === 0, lastDigit: digits[digits.length - 1],
        equal: lhs === rhs,
      });
      if (!go) break;
      if (guard >= maxWalk) { broken = broken || "walk"; break; }
      R -= dd; digits[digits.length - 1]--;
      walk.push(digits[digits.length - 1]);
    }
    const eq = 2n * R * den === 2n * X + dd * den;
    if (eq) {
      const a = 2n * R - dd, b = 2n * fs;
      const c = cmp(a, b, P, T);
      const last = digits[digits.length - 1];
      let action = "keep";
      if (higher) action = "down-higher";
      else if (last % 2 !== 0 && !higher && !lower) action = "down-even";
      // Truth: the candidate below is closer (c > 0), or an exact tie (c === 0) broken to even.
      const truthDown = c > 0 || (c === 0 && last % 2 !== 0);
      tie = { a, b, action, lastDigit: last, truthDown, agrees: (action !== "keep") === truthDown, onAlpha: c === 0 };
      rows.push({ kind: "tie", a, b, R, lhs: 2n * R * den, rhs: 2n * X + dd * den, cached: action !== "keep", truth: truthDown,
        agrees: tie.agrees, action, margin: log10RelDistance(a, b, P, T), onAlpha: c === 0, lastDigit: last });
      if (action !== "keep") { R -= dd; digits[digits.length - 1]--; walk.push(digits[digits.length - 1]); }
    }
    if (d.powerOfTwo) {
      const below = R * den < pL;
      const c = cmp(R, fLs, P, T);
      const truthBelow = inclusive ? c < 0 : c <= 0;
      fixup = { below, truthBelow };
      rows.push({ kind: "fixup", a: R, b: fLs, lhs: R * den, rhs: pL, cached: below, truth: truthBelow,
        agrees: below === truthBelow, margin: log10RelDistance(R, fLs, P, T), onAlpha: c === 0 });
      if (below) { digits[digits.length - 1]++; R += dd; walk.push(digits[digits.length - 1]); }
    }
  }

  const digitString = digits.join("");
  const exponent = dexp; // value = digits × 10^exponent
  return {
    v, d, bnd, sc, table, raw,
    num, den, higher, lower, exactEntry, P, T,
    fLs, fs, fUs, pU0, pL0, pU, pL, tableKey,
    Rfull, Rtrue, topPlace, lengthBeforeWalk, Rloop, R, X, walk, tie, fixup,
    digits: digitString, exponent, rows, broken,
    gap: exactEntry ? null : gapOf(num, den, P, T),
  };
}

/** Gap summary over a whole table (both parts of the simplest intruder, minimum over entries). */
export function gapSummary(table = ORIGINAL) {
  let exact = 0, inexact = 0, minIntruderNum = Infinity, minIntruderDen = Infinity, minDen = null;
  for (let i = 0; i < 325; i++) {
    const en = entryOf(table, i);
    const { P, T } = alphaOfIndex(i);
    const g = gapOf(en.num, en.den, P, T);
    if (!g) { exact++; continue; }
    inexact++;
    minIntruderNum = Math.min(minIntruderNum, g.intruderNumBits);
    minIntruderDen = Math.min(minIntruderDen, g.intruderDenBits);
    if (minDen === null || g.intruder.d < minDen) minDen = g.intruder.d;
  }
  // Question fractions have both parts below 2^59 (ledger claim 4). In either
  // orientation an intruder needs its larger part ≥ minDen, so this suffices:
  const guaranteed = minDen === null || minDen >= 1n << 59n;
  return { exact, inexact, minIntruderNum, minIntruderDen, minDen, guaranteed };
}

/** Everything about the gap between the stand-in num/den and α. */
export function gapOf(num, den, P, T) {
  const c = cmp(num, den, P, T);
  if (c === 0) return null;
  const s = c < 0 ? simplestBetween(num, den, P, T) : simplestBetween(P, T, num, den);
  return {
    side: c < 0 ? "lower" : "higher",
    log10Rel: log10RelDistance(num, den, P, T),
    intruder: s,
    intruderNumBits: log2Big(s.n),
    intruderDenBits: log2Big(s.d),
  };
}

/** Fast path: continued.c without recording. Returns { digits, exponent }. */
export function convert(v, table = ORIGINAL) {
  const bits = bitsOf(v);
  const biased = Number((bits >> 52n) & 0x7ffn);
  let sig = bits & MASK52;
  const zero = sig === 0n;
  let ue;
  if (biased) { sig += 1n << 52n; ue = biased - 1075; } else ue = -1074;
  let ex = sig * 2n, up = sig * 2n + 1n, lo = sig * 2n - 1n, e = ue - 1;
  if (zero) { up *= 2n; ex *= 2n; lo = lo * 2n + 1n; e--; }
  let k, fe, num, den, hi, lw;
  if (e < 0) {
    const nk = ((315652 * -e) >> 20) + 1; const nfe = (3483294 * nk) >> 20; k = -nk; fe = -nfe;
    num = table.td[nk] >> 1n; den = table.tn[nk] >> 1n; hi = table.td[nk] & 1n; lw = table.tn[nk] & 1n;
  } else {
    k = (315652 * (e + 1)) >> 20; fe = (3483294 * k) >> 20;
    num = table.tn[k] >> 1n; den = table.td[k] >> 1n; hi = table.tn[k] & 1n; lw = table.td[k] & 1n;
  }
  const sh = BigInt(e - fe); lo <<= sh; up <<= sh; ex <<= sh;
  let U = up * num, L = lo * num;
  if ((bits & 1n) && !(hi | lw)) { U--; L++; } else { U -= hi; L += lw; }
  let Rf = U / den, dd = 1n, dexp = k;
  while (dd * 10n <= Rf) { dd *= 10n; dexp++; }
  let R = 0n; const buf = [];
  for (let guard = 0; ; guard++) {
    const i = Rf / dd; buf.push(Number(i)); R += i * dd;
    if (R * den >= L) break;
    if (dd === 1n || guard > 30) break;
    Rf %= dd; dd /= 10n; dexp--;
  }
  const X = ex * num;
  if (R * den > X) {
    for (let guard = 0; 2n * R * den > 2n * X + dd * den && guard < 12; guard++) { R -= dd; buf[buf.length - 1]--; }
    const tie = 2n * R * den === 2n * X + dd * den;
    if (hi && tie) { R -= dd; buf[buf.length - 1]--; }
    else if (buf[buf.length - 1] % 2 && !hi && !lw && tie) { R -= dd; buf[buf.length - 1]--; }
    if (zero && R * den < L) buf[buf.length - 1]++;
  }
  return { digits: buf.join(""), exponent: dexp };
}

// ---------------------------------------------------------------- reference + judging

/** Shortest-closest digits of v according to Number.prototype.toString. */
export function referenceDigits(v) {
  const [mant, ex = "0"] = Math.abs(v).toString().split("e");
  const [a, b = ""] = mant.split(".");
  return normalizeDigits(a + b, Number(ex) - b.length);
}

export function normalizeDigits(digits, exponent) {
  let s = digits.replace(/^0+/, "");
  let e = exponent;
  while (s.length > 1 && s.endsWith("0")) { s = s.slice(0, -1); e++; }
  return { digits: s, exponent: e };
}

/** Print digits × 10^exponent the way JavaScript would (scientific form for tiny/huge). */
export function formatOutput(digits, exponent) {
  const sci = digits.length - 1 + exponent;
  if (sci >= -7 && sci < 21) {
    if (exponent >= 0) return digits + "0".repeat(exponent);
    const point = digits.length + exponent;
    if (point > 0) return `${digits.slice(0, point)}.${digits.slice(point)}`;
    return `0.${"0".repeat(-point)}${digits}`;
  }
  return `${digits[0]}${digits.length > 1 ? "." + digits.slice(1) : ""}e${sci >= 0 ? "+" : "-"}${Math.abs(sci)}`;
}

/** Compare an output with the reference: "ok", "too long", "not closest" or "no round trip". */
export function judge(v, out) {
  const ref = referenceDigits(v);
  const got = normalizeDigits(out.digits, out.exponent);
  if (got.digits === ref.digits && got.exponent === ref.exponent) return { verdict: "ok", ref, got };
  if (!/^[0-9]+$/.test(got.digits)) return { verdict: "no round trip", ref, got };
  const back = Number(`${got.digits}e${got.exponent}`);
  if (back !== v) return { verdict: "no round trip", ref, got };
  if (got.digits.length > ref.digits.length) return { verdict: "too long", ref, got };
  return { verdict: "not closest", ref, got };
}

// ---------------------------------------------------------------- deterministic random doubles

export function makeRandom(seed = 12345) {
  let s = BigInt.asUintN(64, BigInt(seed) * 0x9e3779b97f4a7c15n + 1n);
  return function nextDouble() {
    // splitmix64 → a random positive finite bit pattern
    for (;;) {
      s = BigInt.asUintN(64, s + 0x9e3779b97f4a7c15n);
      let z = s;
      z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
      z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
      z ^= z >> 31n;
      const b = z & ((1n << 63n) - 1n);
      if (b === 0n || b >= 0x7ff0000000000000n) continue;
      return fromBits(b);
    }
  };
}

// ---------------------------------------------------------------- the claims ledger

/** 1. The k / e_k shortcuts against exact definitions, for every e_b. */
export function checkShortcuts(ebMin = -1077, ebMax = 971) {
  let bad = 0, count = 0; const diffs = new Set(); const firstBad = [];
  // Exact ⌊log2 10^n⌋ for the indices we need.
  const e = []; for (let i = 0; i <= 330; i++) e.push(exactLog2Pow10(i));
  for (let eb = ebMin; eb <= ebMax; eb++) {
    const s = pickScale(eb);
    count++;
    let ok;
    if (eb >= 0) {
      // Spec: the greatest k with ⌊k·log2 10⌋ ≤ e_b.
      let k = 0; while (e[k + 1] <= eb) k++;
      ok = s.k === k && s.ek === e[k];
    } else {
      // Spec: the smallest n with ⌊n·log2 10⌋ ≥ −e_b (i.e. the greatest k = −n with −e_n ≤ e_b).
      let n = 1; while (e[n] < -eb) n++;
      ok = s.index === n && s.ek === -e[n];
    }
    const { P, T } = alphaOf(s.k, s.ek);
    // α must lie in (1/2, 1] (direct) or [1, 2) (reciprocal).
    const inRange = s.reciprocal ? (P >= T && P < 2n * T) : (2n * P > T && P <= T);
    if (!ok || !inRange || s.diff < 0 || s.diff > 3) { bad++; if (firstBad.length < 3) firstBad.push(eb); }
    diffs.add(s.diff);
  }
  return { count, bad, firstBad, diffs: [...diffs].sort((a, b) => a - b), ebMin, ebMax };
}

/** 2. Termination: den + 2 ≤ 2·num and num + 2 ≤ 2·den for every entry. */
export function checkTermination(table = ORIGINAL) {
  const failing = [];
  for (let i = 0; i < 325; i++) {
    const { num, den } = entryOf(table, i);
    if (!(den + 2n <= 2n * num && num + 2n <= 2n * den)) failing.push({ i, num, den });
  }
  return { failing };
}

/** 3. Separation and the "best approximation" definitions, for every inexact entry. */
export function checkSeparation(table = ORIGINAL) {
  let inexact = 0, exact = 0, lower = 0, higher = 0, notClosest = 0, notPaperBest = 0, notCoprime = 0, tagWrong = 0;
  let minIntruderDen = Infinity, minIntruderNum = Infinity, minNumBits = Infinity, minDenBits = Infinity;
  let maxEntryBits = 0, lastExact = -1;
  const notClosestList = [], notPaperBestList = [];
  let convergentCount = 0, semiCount = 0;
  for (let i = 0; i < 325; i++) {
    const en = entryOf(table, i);
    const { P, T } = alphaOfIndex(i);
    const c = cmp(en.num, en.den, P, T);
    maxEntryBits = Math.max(maxEntryBits, bitLength(en.num), bitLength(en.den));
    if ((c === 0) !== en.exact || (c < 0) !== en.lower || (c > 0) !== en.higher) tagWrong++;
    if (c === 0) { exact++; lastExact = i; continue; }
    inexact++;
    if (c < 0) lower++; else higher++;
    if (gcd(en.num, en.den) !== 1n) notCoprime++;
    minNumBits = Math.min(minNumBits, log2Big(en.num));
    minDenBits = Math.min(minDenBits, log2Big(en.den));
    const g = gapOf(en.num, en.den, P, T);
    minIntruderDen = Math.min(minIntruderDen, g.intruderDenBits);
    minIntruderNum = Math.min(minIntruderNum, g.intruderNumBits);
    // closest fraction with both parts below 2^63?
    const best = bestApproximation(P, T, 1n << 63n);
    if (best.n !== en.num || best.d !== en.den) { notClosest++; if (notClosestList.length < 400) notClosestList.push(i); }
    // paper's definition: no fraction with a smaller denominator is closer.
    const rival = closestWithDenBelow(P, T, en.den);
    if (rival) {
      const dr = absDiff(rival, { n: P, d: T }), de = absDiff({ n: en.num, d: en.den }, { n: P, d: T });
      if (cmp(dr.n, dr.d, de.n, de.d) < 0) { notPaperBest++; if (notPaperBestList.length < 400) notPaperBestList.push(i); }
    }
    // convergent or semiconvergent?
    const conv = convergents(P, T);
    if (conv.some((x) => x.h === en.num && x.k === en.den)) convergentCount++; else semiCount++;
  }
  return { inexact, exact, lastExact, lower, higher, notClosest, notClosestList, notPaperBest, notPaperBestList, notCoprime, tagWrong,
    minIntruderDen, minIntruderNum, minNumBits, minDenBits, maxEntryBits, convergentCount, semiCount };
}

/** Closest fraction to P/T with denominator < D (one of the two Farey neighbours at that bound). */
export function closestWithDenBelow(P, T, D) {
  let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
  const x = { n: P, d: T };
  for (const a of cfTerms(P, T)) {
    const k2 = a * k1 + k0;
    if (k2 < D) { [h0, h1] = [h1, a * h1 + h0]; [k0, k1] = [k1, k2]; continue; }
    const c = k1 ? (D - 1n - k0) / k1 : 0n;
    let best = k1 ? { n: h1, d: k1 } : null;
    if (c >= 1n) {
      const cand = { n: c * h1 + h0, d: c * k1 + k0 };
      if (!best) return cand;
      const dc = absDiff(cand, x), db = absDiff(best, x);
      if (cmp(dc.n, dc.d, db.n, db.d) < 0) best = cand;
    }
    return best;
  }
  return k1 ? { n: h1, d: k1 } : null;
}

/** 4. Operand widths over every exponent with extreme significands. */
export function checkWidths(table = ORIGINAL) {
  const m = { boundary: 0, twoFs: 0, R: 0, product: 0, walkProduct: 0 };
  let runs = 0;
  const probe = (bits) => {
    const v = fromBits(bits);
    const t = trace(v, table);
    runs++;
    m.boundary = Math.max(m.boundary, bitLength(t.fUs), bitLength(t.fLs), bitLength(t.fs));
    m.twoFs = Math.max(m.twoFs, bitLength(2n * t.fs));
    m.R = Math.max(m.R, bitLength(t.Rfull));
    m.product = Math.max(m.product, bitLength(t.pU0), bitLength(t.pL0), bitLength(t.X));
    for (const r of t.rows) {
      if (r.lhs !== undefined) m.walkProduct = Math.max(m.walkProduct, bitLength(r.lhs), bitLength(r.rhs));
      m.twoFs = Math.max(m.twoFs, bitLength(r.a), bitLength(r.b));
    }
  };
  for (let biased = 0; biased <= 2046; biased++) {
    const base = BigInt(biased) << 52n;
    if (biased) probe(base); // power of two
    probe(base | MASK52);
    probe(base | 1n);
  }
  return { ...m, runs };
}

/** 5. Shortest length, certified per input with exact arithmetic (not the cache). */
export function certifyShortest(v, table = ORIGINAL) {
  const t = trace(v, table);
  // The output has L digits and its last digit sits at place 10^(exponent).
  // Certify: (a) the prefix one digit shorter is below m⁻ (or equal to it when
  // m⁻ is excluded) and (b) that prefix plus one unit of its last place lies
  // above m⁺ (or on it when m⁺ is excluded). Then no shorter decimal is inside.
  const L = t.lengthBeforeWalk;
  if (L === 1) return { ok: true, trivial: true };
  const prev = t.rows.filter((r) => r.kind === "prefix")[L - 2];
  const { P, T, fLs, fUs } = t;
  const inclusive = !t.d.odd;
  const a = prev.a, unit = prev.dd;
  const cl = cmp(a, fLs, P, T); // prefix vs lower boundary
  const below = inclusive ? cl < 0 : cl <= 0;
  const cu = cmp(a + unit, fUs, P, T);
  const above = inclusive ? cu > 0 : cu >= 0;
  return { ok: below && above, trivial: false };
}
